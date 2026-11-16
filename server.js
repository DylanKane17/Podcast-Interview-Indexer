require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { convertToWav, transcribeWav } = require("./transcribe");

const app = express();

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

// Turns multer's "file too large" error into a clean 413 response.
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File exceeds the 25 MB limit." });
  }
  next(err);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
