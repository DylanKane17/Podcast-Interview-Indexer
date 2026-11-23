import { useRef, useState } from "react";

function Recorder({ disabled, onRecording, onRecordingChange, onStart }) {
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // Pick a broadly supported web audio format, falling back to the browser default.
      const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size > 0) {
          // Keep the required upload filename; ffmpeg on the server reads the actual audio data.
          onRecording(new File([blob], "recording.webm", { type: blob.type }));
        } else {
          setMessage("No audio was captured. Try recording again.");
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
        onRecordingChange(false);
      };
      recorder.start();
      onStart();
      setIsRecording(true);
      onRecordingChange(true);
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      setMessage(
        denied
          ? "Microphone access was denied. Allow microphone access in your browser settings and try again."
          : "Could not start the microphone. Check that it is connected and try again.",
      );
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onRecordingChange(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  return (
    <div className={`recorder-option${isRecording ? " is-recording" : ""}`}>
      <div className="record-icon" aria-hidden="true">
        {isRecording ? <span className="recording-square" /> : <span className="recording-circle" />}
      </div>
      <div className="option-copy">
        <div className="option-title">
          Record a memo
          {isRecording && <span className="recording-indicator"><i /> RECORDING</span>}
        </div>
        <p>Use your microphone</p>
      </div>
      {isRecording ? (
        <button className="record-control stop-control" type="button" onClick={stopRecording}>
          Stop
        </button>
      ) : (
        <button
          className="record-control start-control"
          type="button"
          onClick={startRecording}
          disabled={disabled}
        >
          Start
        </button>
      )}
      {message && <p className="recorder-message" role="alert">{message}</p>}
    </div>
  );
}

export default Recorder;
