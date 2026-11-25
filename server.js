const { initTelemetry } = require("./telemetry");
initTelemetry(); // must run before express and the Azure SDKs

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { trace, metrics } = require("@opentelemetry/api");
const { convertToWav, transcribeWav } = require("./transcribe");
const { analyzeText, errorReason } = require("./analyze");
const { buildSummary, synthesize } = require("./tts");

const tracer = trace.getTracer("memo-analyzer");
const meter = metrics.getMeter("memo-analyzer");
const sttConfidenceGauge = meter.createGauge("stt_confidence");
const stageSttHist = meter.createHistogram("stage_stt_ms");
const stageLanguageHist = meter.createHistogram("stage_language_ms");
const stageTtsHist = meter.createHistogram("stage_tts_ms");
const searchLatencyHist = meter.createHistogram("search_latency_ms"); // domain metric

// Runs fn inside a named child span and returns [result, elapsedMs].
async function inStage(name, fn) {
  return tracer.startActiveSpan(name, async (span) => {
    const t0 = performance.now();
    try {
      const result = await fn(span);
      return [result, performance.now() - t0];
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
      throw err;
    } finally {
      span.setAttribute("duration_ms", performance.now() - t0);
      span.end();
    }
  });
}

const episodes = []; // in-memory archive (resets when the app restarts)

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  dest: path.join(os.tmpdir(), "uploads"),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No file uploaded. Send a multipart field named 'audio'.",
    });
  }
  const inputPath = req.file.path;
  const wavPath = inputPath + ".wav";
  try {
    await convertToWav(inputPath, wavPath);
    res.json(await transcribeWav(wavPath));
  } catch (err) {
    if (err.code === "BAD_AUDIO")
      return res.status(415).json({ error: err.message });
    console.error(err);
    res
      .status(500)
      .json({ error: "Transcription failed.", detail: err.message });
  } finally {
    await fs.promises.rm(inputPath, { force: true });
    await fs.promises.rm(wavPath, { force: true });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    res.json(await analyzeText(req.body?.text));
  } catch (err) {
    if (err.code === "BAD_INPUT")
      return res.status(400).json({ error: err.message });
    console.error(err);
    res
      .status(502)
      .json({ error: "Language analysis failed.", detail: errorReason(err) });
  }
});

app.post("/process", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No file uploaded. Send a multipart field named 'audio'.",
    });
  }
  const inputPath = req.file.path;
  const wavPath = inputPath + ".wav";
  const audioFormat = (
    req.file.originalname.split(".").pop() || "unknown"
  ).toLowerCase();
  let stage = "upload";
  const rootSpan = trace.getActiveSpan();
  rootSpan?.setAttribute("audio.format", audioFormat);

  try {
    stage = "speech_to_text";
    const [transcription, sttMs] = await inStage(
      "stage.speech_to_text",
      async (span) => {
        await convertToWav(inputPath, wavPath);
        const t = await transcribeWav(wavPath);
        span.setAttribute("stt.confidence", t.confidence);
        span.setAttribute(
          "stt.word_count",
          t.transcript.split(/\s+/).filter(Boolean).length,
        );
        return t;
      },
    );
    if (!transcription.transcript.trim()) {
      return res
        .status(422)
        .json({ error: "No speech was recognized in the audio.", stage });
    }

    stage = "language_analysis";
    const [analysis, langMs] = await inStage(
      "stage.language_analysis",
      async (span) => {
        const a = await analyzeText(transcription.transcript);
        span.setAttribute("entity_count", a.entities.length);
        span.setAttribute("sentiment", a.sentiment.label);
        return a;
      },
    );

    stage = "text_to_speech";
    const summaryText = buildSummary(analysis);
    const [tts, ttsMs] = await inStage("stage.text_to_speech", async (span) => {
      span.setAttribute("char_count", summaryText.length);
      return synthesize(summaryText);
    });

    const attrs = {
      audio_format: audioFormat,
      language: transcription.language,
    };
    sttConfidenceGauge.record(transcription.confidence, attrs);
    stageSttHist.record(sttMs, attrs);
    stageLanguageHist.record(langMs, attrs);
    stageTtsHist.record(ttsMs, attrs);
    rootSpan?.setAttribute("event.name", "pipeline_completed");

    episodes.push({
      id: episodes.length + 1,
      title: req.file.originalname,
      transcript: transcription.transcript,
      key_phrases: analysis.key_phrases,
      entities: analysis.entities,
    });

    res.json({
      transcription,
      analysis,
      summary: { text: summaryText, ...tts },
    });
  } catch (err) {
    rootSpan?.setAttribute("event.name", "pipeline_error");
    rootSpan?.setAttribute("error.stage", stage);
    if (err.code === "BAD_AUDIO")
      return res.status(415).json({ error: err.message, stage });
    if (err.code === "BAD_INPUT")
      return res.status(422).json({ error: err.message, stage });
    console.error(`/process failed at ${stage}:`, err);
    res.status(stage === "language_analysis" ? 502 : 500).json({
      error: `Pipeline failed at stage: ${stage}.`,
      stage,
      detail: errorReason(err),
    });
  } finally {
    await fs.promises.rm(inputPath, { force: true });
    await fs.promises.rm(wavPath, { force: true });
  }
});

// Minimal search so the domain metric (search latency) has something to measure.
app.get("/search", (req, res) => {
  const t0 = performance.now();
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  if (!q)
    return res
      .status(400)
      .json({ error: "Provide a query like /search?q=carbon" });
  const results = episodes
    .filter((e) => e.transcript.toLowerCase().includes(q))
    .map((e) => {
      const i = e.transcript.toLowerCase().indexOf(q);
      return {
        episode_id: e.id,
        title: e.title,
        snippet: e.transcript.slice(Math.max(0, i - 40), i + 80),
      };
    });
  const latency_ms = Math.round((performance.now() - t0) * 100) / 100;
  searchLatencyHist.record(latency_ms, { result_count: results.length });
  res.json({ query: q, latency_ms, result_count: results.length, results });
});

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File exceeds the 25 MB limit." });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON." });
  }
  next(err);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
