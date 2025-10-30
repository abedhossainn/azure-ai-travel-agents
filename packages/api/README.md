# API (Genkit + Gemini)

Genkit-powered API using the Google Gemini provider. Primary endpoints:

- POST `/api/chat` — SSE stream of JSON events (used by UI)
- POST `/api/v2/chat` — JSON response (structured sections)
- GET `/api/health` — service and web search status

## Environment

Create `packages/api/.env` with at least:

```ini
GEMINI_API_KEY=<your_gemini_key>
model="gemini-2.5-flash-lite"
PORT=4000
```

Optional: OpenTelemetry variables if you use tracing/telemetry.

Optional: Enable Google Custom Search for the `web-search` flow (live web results). If not set, the flow returns an LLM-only answer with a disclaimer.

```ini
# Either set GOOGLE_CSE_KEY or GOOGLE_API_KEY (GOOGLE_CSE_KEY takes precedence)
# Aliases also supported: GOOGLE_CUSTOM_SEARCH_API_KEY, GOOGLE_CUSTOM_SEARCH_CX or GOOGLE_CUSTOM_SEARCH_ENGINE_ID
GOOGLE_CSE_KEY=<google_cse_api_key>
# or GOOGLE_API_KEY=<google_api_key> (or GOOGLE_CUSTOM_SEARCH_API_KEY)
GOOGLE_CSE_CX=<custom_search_engine_id>  # or GOOGLE_CUSTOM_SEARCH_CX / GOOGLE_CUSTOM_SEARCH_ENGINE_ID
```

## Run locally

```fish
cd packages/api
npm install
npm run build
npm start
```

## Quick test

```fish
# Health
curl -sS http://localhost:4000/api/health

# Streamed chat (SSE-style newline-delimited JSON)
curl -sS -H "Content-Type: application/json" \
  -d '{"message":"Plan a 2-day trip to Kyoto"}' \
  http://localhost:4000/api/chat

# JSON-only chat
curl -sS -H "Content-Type: application/json" \
  -d '{"message":"Plan a 2-day trip to Kyoto"}' \
  http://localhost:4000/api/v2/chat

## Smoke test

Run all quick checks at once (requires API running on port 4000):

```fish
cd packages/api
npm run smoke
```

## Notes

- The UI continues to call `/api/chat` and should work unchanged.
- Legacy MCP/LangChain/LlamaIndex code paths were removed.
- To use the Genkit Dev UI alongside the API, run it separately (default: 4100).
