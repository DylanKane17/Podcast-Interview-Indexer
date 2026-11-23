function formatConfidence(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function Results({ results }) {
  if (!results) {
    return (
      <section className="results-card results-empty" aria-label="Analysis results">
        <div className="empty-art" aria-hidden="true">
          <span className="empty-ring ring-one" />
          <span className="empty-ring ring-two" />
          <span className="empty-center">♪</span>
        </div>
        <span className="section-index">02 / INSIGHTS</span>
        <h2>Your memo, decoded.</h2>
        <p>Transcript, key phrases, people, and tone will appear here after analysis.</p>
        <div className="empty-rule"><span /><span /><span /></div>
      </section>
    );
  }

  const { transcription = {}, analysis = {}, summary = {} } = results;
  const entities = Array.isArray(analysis.entities) ? analysis.entities : [];
  const phrases = Array.isArray(analysis.key_phrases) ? analysis.key_phrases : [];

  return (
    <section className="results-card" aria-label="Analysis results">
      <div className="results-heading">
        <div>
          <span className="section-index">02 / INSIGHTS</span>
          <h2>Memo analysis</h2>
        </div>
        <span className="complete-badge"><i /> COMPLETE</span>
      </div>

      <article className="result-section transcript-section">
        <div className="result-label-row">
          <h3>TRANSCRIPT</h3>
          <span className="confidence-label">
            {formatConfidence(transcription.confidence)} confidence
          </span>
        </div>
        <p className="transcript-text">{transcription.transcript || "No transcript returned."}</p>
      </article>

      <article className="result-section">
        <h3>KEY PHRASES <span className="count-label">{phrases.length}</span></h3>
        {phrases.length > 0 ? (
          <div className="phrase-list">
            {phrases.map((phrase, index) => (
              <span className="phrase-tag" key={`${phrase}-${index}`}>{phrase}</span>
            ))}
          </div>
        ) : (
          <p className="muted-result">No key phrases found.</p>
        )}
      </article>

      <article className="result-section">
        <div className="result-label-row">
          <h3>ENTITIES <span className="count-label">{entities.length}</span></h3>
        </div>
        {entities.length > 0 ? (
          <div className="entity-table-wrap">
            <table className="entity-table">
              <thead>
                <tr><th>TEXT</th><th>CATEGORY</th><th>CONFIDENCE</th></tr>
              </thead>
              <tbody>
                {entities.map((entity, index) => (
                  <tr key={`${entity.text}-${entity.category}-${index}`}>
                    <td>{entity.text}</td>
                    <td><span className="category-chip">{entity.category}</span></td>
                    <td>{formatConfidence(entity.confidence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-result">No entities found.</p>
        )}
      </article>

      <div className="result-bottom">
        <article className="sentiment-panel">
          <h3>SENTIMENT</h3>
          <div className="sentiment-content">
            <span className="sentiment-dot" />
            <strong>{analysis.sentiment?.label || "Unknown"}</strong>
            <span>{formatConfidence(analysis.sentiment?.confidence)}</span>
          </div>
        </article>
        <article className="summary-panel">
          <h3>SPOKEN SUMMARY</h3>
          {summary.audio_base64 ? (
            <audio
              controls
              preload="none"
              src={"data:audio/mp3;base64," + summary.audio_base64}
            >
              Your browser does not support audio playback.
            </audio>
          ) : (
            <p className="muted-result">No spoken summary returned.</p>
          )}
        </article>
      </div>
    </section>
  );
}

export default Results;
