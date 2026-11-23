import { useState } from "react";
import Recorder from "./components/Recorder.jsx";
import UploadInput from "./components/UploadInput.jsx";
import Results from "./components/Results.jsx";
import "./App.css";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function App() {
  const [audioFile, setAudioFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputError, setInputError] = useState("");
  const [requestError, setRequestError] = useState(null);
  const [results, setResults] = useState(null);

  const handleUpload = (file) => {
    setInputError("");
    setRequestError(null);
    setResults(null);

    if (!file) return;
    if (!/\.(wav|mp3)$/i.test(file.name)) {
      setAudioFile(null);
      setInputError("Choose a .wav or .mp3 audio file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setAudioFile(null);
      setInputError("This file is larger than the 25 MB limit.");
      return;
    }

    setAudioFile(file);
  };

  const handleRecording = (file) => {
    setAudioFile(file);
    setInputError("");
    setRequestError(null);
    setResults(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!audioFile || isSubmitting || isRecording) return;

    setIsSubmitting(true);
    setRequestError(null);
    setResults(null);

    const formData = new FormData();
    // Let the browser set the multipart boundary; overriding Content-Type breaks the upload.
    formData.append("audio", audioFile, audioFile.name);

    try {
      const response = await fetch("/process", {
        method: "POST",
        body: formData,
      });
      const responseText = await response.text();
      let payload = null;

      // The Vite proxy can return an empty, non-JSON 500 when Express is offline.
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        setRequestError({
          error:
            payload?.error ||
            `The server returned HTTP ${response.status} without a JSON error. Make sure Express is running at http://localhost:3000.`,
          stage: payload?.stage || (response.status >= 500 ? "connection" : "Not provided"),
          detail: typeof payload?.detail === "string" ? payload.detail : "",
        });
        return;
      }

      if (!payload || typeof payload !== "object") {
        setRequestError({
          error: "The server returned an empty or invalid JSON response.",
          stage: "response",
        });
        return;
      }

      setResults(payload);
    } catch {
      setRequestError({
        error:
          "Could not connect to the processing server. Start Express with `npm start` and make sure it is listening at http://localhost:3000.",
        stage: "connection",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Memo Studio home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>FIELDNOTES</span>
        </a>
        <span className="topbar-note">INTERVIEW INTELLIGENCE · 01</span>
      </header>

      <section className="hero">
        <p className="eyebrow"><span /> YOUR AUDIO, MADE USEFUL</p>
        <h1>Every conversation<br />has a <em>story.</em></h1>
        <p className="hero-copy">
          Record a thought or bring a recording. We’ll find the ideas, people,
          and tone inside it.
        </p>
      </section>

      <section className="workspace" aria-label="Audio memo processing">
        <div className="input-card">
          <div className="section-heading">
            <div>
              <span className="section-index">01 / INPUT</span>
              <h2>Start with a memo</h2>
            </div>
            <span className="privacy-note">WAV · MP3 · UP TO 25 MB</span>
          </div>

          <div className="input-options">
            <Recorder
              disabled={isSubmitting}
              onRecording={handleRecording}
              onRecordingChange={setIsRecording}
              onStart={() => {
                setAudioFile(null);
                setResults(null);
                setRequestError(null);
              }}
            />
            <div className="option-divider"><span>OR</span></div>
            <UploadInput
              disabled={isRecording || isSubmitting}
              onSelect={handleUpload}
            />
          </div>

          <div className="submit-row">
            <div className="selection-status" aria-live="polite">
              {audioFile ? (
                <>
                  <span className="status-dot" />
                  <span className="selected-name">{audioFile.name}</span>
                  <button
                    className="clear-button"
                    type="button"
                    onClick={() => {
                      setAudioFile(null);
                      setResults(null);
                    }}
                    disabled={isSubmitting || isRecording}
                    aria-label="Clear selected audio"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span>{isRecording ? "Recording in progress…" : "No audio selected yet"}</span>
              )}
            </div>
            <button
              className="submit-button"
              type="button"
              onClick={handleSubmit}
              disabled={!audioFile || isSubmitting || isRecording}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Processing
                </>
              ) : (
                <>
                  Analyze memo <span aria-hidden="true">↗</span>
                </>
              )}
            </button>
          </div>

          {inputError && <p className="inline-error" role="alert">{inputError}</p>}
          {requestError && (
            <div className="request-error" role="alert">
              <strong>{requestError.error}</strong>
              <span>Stage: {requestError.stage}</span>
              {requestError.detail && <span>Details: {requestError.detail}</span>}
            </div>
          )}
        </div>

        <Results results={results} />
      </section>

      <footer className="footer">
        <span>FIELDNOTES <span className="footer-dot">•</span> SPEECH TO SIGNAL</span>
        <span>MADE FOR THE DETAILS THAT MATTER</span>
      </footer>
    </main>
  );
}

export default App;
