import { useRef } from "react";

function UploadInput({ disabled, onSelect }) {
  const inputRef = useRef(null);

  const handleChange = (event) => {
    const file = event.target.files?.[0] || null;
    onSelect(file);
    // Clearing the native input lets users retry the same file after a validation error.
    event.target.value = "";
  };

  return (
    <div className="upload-option">
      <div className="upload-icon" aria-hidden="true">↑</div>
      <div className="option-copy">
        <div className="option-title">Upload a recording</div>
        <p>Choose an existing audio file</p>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept=".wav,.mp3,audio/wav,audio/mpeg"
        onChange={handleChange}
        disabled={disabled}
        aria-label="Choose a WAV or MP3 audio file"
      />
      <button
        className="upload-control"
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Browse
      </button>
    </div>
  );
}

export default UploadInput;
