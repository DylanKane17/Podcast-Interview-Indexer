require("dotenv").config({ path: "/Users/dylan/secrets/cs345.env" });

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { convertToWav, transcribeWav } = require("./transcribe");
const { analyzeText, errorReason } = require("./analyze");
const { buildSummary, synthesize } = require("./tts"); // NEW

const app = express();
app.use(express.json());

const upload = multer({
  dest: "temp_audio/",
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

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
    const result = await transcribeWav(wavPath);
    res.json(result);
  } catch (err) {
    if (err.code === "BAD_AUDIO") {
      res.status(415).json({ error: err.message });
    } else {
      console.error(err);
      res
        .status(500)
        .json({ error: "Transcription failed.", detail: err.message });
    }
  } finally {
    await fs.promises.rm(inputPath, { force: true });
    await fs.promises.rm(wavPath, { force: true });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    res.json(await analyzeText(req.body?.text));
  } catch (err) {
    if (err.code === "BAD_INPUT") {
      return res.status(400).json({ error: err.message });
    }
    console.error("Language analysis failed:", errorReason(err));
    res
      .status(502)
      .json({ error: "Language analysis failed.", detail: errorReason(err) });
  }
});

// NEW: the whole /process route
app.post("/process", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No file uploaded. Send a multipart field named 'audio'.",
    });
  }

  const inputPath = req.file.path;
  const wavPath = inputPath + ".wav";
  let stage = "upload";

  try {
    // Stage 1: Speech-to-Text
    stage = "speech_to_text";
    await convertToWav(inputPath, wavPath);
    const transcription = await transcribeWav(wavPath);

    if (!transcription.transcript.trim()) {
      return res
        .status(422)
        .json({ error: "No speech was recognized in the audio.", stage });
    }

    // Stage 2: Language analysis
    stage = "language_analysis";
    const analysis = await analyzeText(transcription.transcript);

    // Stage 3: Text-to-Speech
    stage = "text_to_speech";
    const summaryText = buildSummary(analysis);
    const tts = await synthesize(summaryText);

    // Stage 4: one combined response
    res.json({
      transcription,
      analysis,
      summary: { text: summaryText, ...tts },
    });
  } catch (err) {
    if (err.code === "BAD_AUDIO") {
      return res.status(415).json({ error: err.message, stage });
    }
    if (err.code === "BAD_INPUT") {
      return res.status(422).json({ error: err.message, stage });
    }
    // Axios errors contain request headers; log only the sanitized error message.
    console.error(`/process failed at ${stage}:`, errorReason(err));
    const status = stage === "language_analysis" ? 502 : 500;
    res.status(status).json({
      error: `Pipeline failed at stage: ${stage}.`,
      stage,
      detail: errorReason(err),
    });
  } finally {
    await fs.promises.rm(inputPath, { force: true });
    await fs.promises.rm(wavPath, { force: true });
  }
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

const clientDistPath = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
