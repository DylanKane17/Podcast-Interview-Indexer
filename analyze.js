const axios = require("axios");

const MAX_CHARS = 5120; // Azure's limit for one document in a synchronous call
const HANDSHAKE_RETRY_DELAY_MS = 300;

class InputError extends Error {
  constructor(message) {
    super(message);
    this.code = "BAD_INPUT";
  }
}

// Call one Azure AI Language feature. `kind` picks the feature.
async function callLanguage(kind, text, language) {
  const base = process.env.AZURE_LANGUAGE_ENDPOINT.replace(/\/+$/, "");
  const url = `${base}/language/:analyze-text`;
  const body = {
    kind,
    parameters: { modelVersion: "latest" },
    analysisInput: { documents: [{ id: "1", language, text }] },
  };
  const options = {
    params: { "api-version": "2023-04-01" },
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_LANGUAGE_KEY,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  };

  let response;
  try {
    response = await axios.post(url, body, options);
  } catch (err) {
    const code = err.code || err.cause?.code;
    const message = err.message || err.cause?.message || "";
    const resetDuringHandshake =
      code === "ECONNRESET" &&
      message.includes("before secure TLS connection was established");
    if (!resetDuringHandshake) throw err;

    // The request has not reached Azure yet, so one retry cannot duplicate analysis work.
    await new Promise((resolve) => setTimeout(resolve, HANDSHAKE_RETRY_DELAY_MS));
    response = await axios.post(url, body, options);
  }

  const results = response.data.results;
  const doc = results.documents[0];
  if (!doc) {
    const docError = results.errors?.[0]?.error;
    throw new Error(
      docError
        ? `${docError.code}: ${docError.message}`
        : "No result returned.",
    );
  }
  return doc;
}

function errorReason(err) {
  return err.response?.data?.error?.message || err.message;
}

async function analyzeText(text, language = "en") {
  if (typeof text !== "string" || !text.trim()) {
    throw new InputError("Body must be JSON with a non-empty 'text' string.");
  }
  if (text.length > MAX_CHARS) {
    throw new InputError(
      `Text is ${text.length} characters; the limit is ${MAX_CHARS}.`,
    );
  }

  // The three required features run in parallel. Linked entities is optional,
  // so its failure is caught separately and does not fail the whole request.
  const [keyPhrases, entities, sentiment, linked] = await Promise.all([
    callLanguage("KeyPhraseExtraction", text, language),
    callLanguage("EntityRecognition", text, language),
    callLanguage("SentimentAnalysis", text, language),
    callLanguage("EntityLinking", text, language).then(
      (doc) => ({
        available: true,
        items: doc.entities.map((e) => ({
          name: e.name,
          url: e.url,
          data_source: e.dataSource,
          matches: e.matches.map((m) => ({
            text: m.text,
            confidence: m.confidenceScore,
          })),
        })),
      }),
      (err) => ({ available: false, reason: errorReason(err) }),
    ),
  ]);

  return {
    language,
    key_phrases: keyPhrases.keyPhrases,
    entities: entities.entities.map((e) => ({
      text: e.text,
      category: e.category,
      subcategory: e.subcategory || null,
      confidence: e.confidenceScore,
    })),
    sentiment: {
      label: sentiment.sentiment,
      confidence: sentiment.confidenceScores[sentiment.sentiment] ?? null,
      scores: sentiment.confidenceScores,
    },
    linked_entities: linked,
  };
}

module.exports = { analyzeText, InputError, errorReason };
