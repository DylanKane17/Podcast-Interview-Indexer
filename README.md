# Podcast-Interview-Indexer

An audio memo and interview analysis app with browser recording, file upload,
speech transcription, key phrase and entity extraction, sentiment analysis, and
a spoken summary.

## Run locally

Install the frontend dependencies and start the Express API in one terminal:

```sh
npm install --prefix client
npm start
```

Keep that API terminal running. In another terminal, start the Vite development
server:

```sh
npm run dev --prefix client
```

Vite proxies `/process` requests to the Express server at `http://localhost:3000`.
If analysis reports a connection error, check that the Express server is still
running on port `3000`.
To serve the built frontend through Express, build it first and then start the
server:

```sh
npm run build --prefix client
npm start
```
