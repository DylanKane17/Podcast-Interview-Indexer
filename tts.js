const sdk = require("microsoft-cognitiveservices-speech-sdk");

const ENTITY_LABELS = {
  Person: ["person", "people"],
  PersonType: ["role", "roles"],
  Organization: ["organization", "organizations"],
  Location: ["location", "locations"],
  DateTime: ["date or time", "dates or times"],
  Quantity: ["quantity", "quantities"],
  Event: ["event", "events"],
  Product: ["product", "products"],
  Skill: ["skill", "skills"],
  Address: ["address", "addresses"],
  PhoneNumber: ["phone number", "phone numbers"],
  Email: ["email address", "email addresses"],
  URL: ["web address", "web addresses"],
  IPAddress: ["IP address", "IP addresses"],
};

function joinList(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Turn the analysis object from analyzeText() into a sentence or two of plain English.
function buildSummary(analysis) {
  const parts = [];

  // Key phrases: count plus up to three topics
  const phrases = analysis.key_phrases;
  if (phrases.length === 0) {
    parts.push("I did not find any key topics in your memo.");
  } else {
    const n = phrases.length;
    const top = phrases.slice(0, 3);
    parts.push(
      `Your memo mentions ${n} key topic${n === 1 ? "" : "s"}: ${joinList(top)}.`,
    );
  }

  // Sentiment
  parts.push(`The overall tone is ${analysis.sentiment.label}.`);

  // Entity types and counts
  const counts = {};
  for (const e of analysis.entities)
    counts[e.category] = (counts[e.category] || 0) + 1;
  const categories = Object.keys(counts);
  if (categories.length === 0) {
    parts.push("I did not detect any named entities.");
  } else {
    const pieces = categories.map((cat) => {
      const [singular, plural] = ENTITY_LABELS[cat] || [
        cat.toLowerCase(),
        `${cat.toLowerCase()}s`,
      ];
      return `${counts[cat]} ${counts[cat] === 1 ? singular : plural}`;
    });
    parts.push(`I detected ${joinList(pieces)}.`);
  }

  return parts.join(" ");
}

// Convert text to spoken MP3 audio using an Azure neural voice.
function synthesize(text, voice = "en-US-JennyNeural") {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY,
      process.env.AZURE_SPEECH_REGION,
    );
    speechConfig.speechSynthesisVoiceName = voice;
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // null audio config = keep the audio in memory instead of playing it on the server
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve({
            audio_base64: Buffer.from(result.audioData).toString("base64"),
            audio_format: "audio/mp3",
            voice,
            char_count: text.length,
          });
        } else {
          reject(new Error(result.errorDetails || "Speech synthesis failed."));
        }
      },
      (err) => {
        synthesizer.close();
        reject(new Error(String(err)));
      },
    );
  });
}

module.exports = { buildSummary, synthesize };
