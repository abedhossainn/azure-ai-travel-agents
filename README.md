# AI Travel Agent — Genkit + Gemini

A compact travel assistant powered by Google Genkit and Gemini. It runs a single orchestrated flow that: extracts your preferences, does live web research (Google CSE), recommends destinations, and generates an itinerary. The API streams results to the Angular UI via Server‑Sent Events (SSE).

## Quick start (local)

Prerequisites:

- Node.js 22+ and npm
- GEMINI_API_KEY (required)
- Google Custom Search key and Search Engine ID (optional, for live web search)

1. API setup

```fish
cd packages/api
npm install
cp .env.sample .env
```

Edit `packages/api/.env` and set your keys:

```ini
GEMINI_API_KEY=<your_gemini_api_key>
model="gemini-2.5-flash-lite"

# Optional: enable live web search
GOOGLE_CUSTOM_SEARCH_API_KEY=<your_google_api_key>
GOOGLE_CUSTOM_SEARCH_CX=<your_search_engine_id>
```

Start the API:

```fish
npm run build
npm start
```

2. UI setup (new terminal)

```fish
cd packages/ui
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200) (API at [http://localhost:4000](http://localhost:4000)).

### Optional: Genkit Dev UI

```fish
cd packages/api
npm run genkit:dev
```

Dev UI at [http://localhost:4100](http://localhost:4100) (telemetry at [http://localhost:4033](http://localhost:4033)).

## API endpoints

- GET `/api/health` – health and web search status
- POST `/api/chat` – SSE streaming responses for the UI
- POST `/api/v2/chat` – JSON response with structured sections

## Troubleshooting

- Model not found: try a different model (for example, `gemini-1.5-flash`) or verify API key access.
- Web search disabled: ensure `GOOGLE_CUSTOM_SEARCH_API_KEY` and `GOOGLE_CUSTOM_SEARCH_CX` are set and that “Custom Search JSON API” is enabled. `/api/health` should show `webSearch.live: true`.
- UI not connecting: verify the UI’s API URL is `http://localhost:4000`.

## License

MIT — see `LICENSE.md`.

