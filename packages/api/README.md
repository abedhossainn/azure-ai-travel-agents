## API (Genkit + Gemini) - Quickstart

Lightweight Genkit-powered API for travel planning. Primary endpoints:

- POST `/api/chat` — SSE stream (used by the UI)
- POST `/api/v2/chat` — JSON response (structured sections)
- GET `/api/health` — service + web search status

Create `.env` from `.env.sample` with your model and keys (Gemini, Amadeus if used). `npm install && npm run build && npm start` from `packages/api` starts the server.

See top-level README for full developer guidance and deployment notes.
