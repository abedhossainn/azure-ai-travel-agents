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

Optional: Enable Amadeus live data for the `web-search` flow (recommended). If not set, the flow returns an LLM-only answer with a disclaimer.

```ini
# Amadeus (Self-Service):
# Provide either the AMADEUS_* variables or KEY/SECRET as fallback
AMADEUS_CLIENT_ID=<your_amadeus_client_id>
AMADEUS_CLIENT_SECRET=<your_amadeus_client_secret>
# Hostname: 'test' (sandbox) or 'production'
AMADEUS_HOST=test
```

### Live research behavior (Amadeus)

When Amadeus is enabled, the Web Search flow will:

- Extract a destination from the user query
- Resolve the city location via Amadeus (coordinates)
- Fetch Tours & Activities near the destination
- Summarize typical experiences and price ranges, and provide budget tips

If Amadeus isn’t configured or fails, it falls back to an LLM-only answer with a brief note.

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
