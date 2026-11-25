const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { spawn } = require("child_process");
const fs = require("fs");

class BadAudioError extends Error {
  constructor(message) {
    super(message);
    this.code = "BAD_AUDIO";
  }
}

// Convert any audio file to 16 kHz, 16-bit, mono WAV using ffmpeg.
function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const bundled = require("ffmpeg-static");
    const ffmpegPath =
      bundled && require("fs").existsSync(bundled) ? bundled : "ffmpeg";
    const ff = spawn(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);
    ff.on("error", reject); // ffmpeg could not start (not installed)
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new BadAudioError("Could not decode the uploaded file as audio."),
        );
    });
  });
}

// Transcribe a WAV file using continuous recognition.
function transcribeWav(wavPath, language = "en-US") {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY,
      process.env.AZURE_SPEECH_REGION,
    );
    speechConfig.speechRecognitionLanguage = language;
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;
    speechConfig.requestWordLevelTimestamps();

    const audioConfig = sdk.AudioConfig.fromWavFileInput(
      fs.readFileSync(wavPath),
    );
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    const texts = [];
    const words = [];
    const segmentConfidences = [];
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      recognizer.stopContinuousRecognitionAsync(
        () => {
          recognizer.close();
          if (err) return reject(err);
          const avg = segmentConfidences.length
            ? segmentConfidences.reduce((a, b) => a + b, 0) /
              segmentConfidences.length
            : 0;
          resolve({
            transcript: texts.join(" "),
            language,
            duration_seconds:
              Math.round((fs.statSync(wavPath).size / 32000) * 10) / 10,
            confidence: Math.round(avg * 1000) / 1000,
            words,
          });
        },
        (stopErr) => {
          recognizer.close();
          reject(new Error(String(stopErr)));
        },
      );
    };

    recognizer.recognized = (_sender, e) => {
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      texts.push(e.result.text);
      const best = JSON.parse(e.result.json).NBest?.[0];
      if (!best) return;
      segmentConfidences.push(best.Confidence);
      for (const w of best.Words || []) {
        words.push({
          word: w.Word,
          offset: w.Offset / 1e7,
          duration: w.Duration / 1e7,
          confidence: w.Confidence ?? null,
        });
      }
    };

    recognizer.canceled = (_sender, e) => {
      if (e.reason === sdk.CancellationReason.Error)
        finish(new Error(e.errorDetails));
      else finish();
    };
    recognizer.sessionStopped = () => finish();

    recognizer.startContinuousRecognitionAsync(
      () => {},
      (err) => finish(new Error(String(err))),
    );
  });
}

module.exports = { convertToWav, transcribeWav, BadAudioError };
