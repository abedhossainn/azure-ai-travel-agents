# Project Status — AI Travel Agents

Last updated: 2025-11-02

## Overview

Key roots:

- API gateway: `packages/api/`
- Genkit flows: `packages/api/src/genkit/agents/flows.ts`
- Express routes: `packages/api/src/index.ts`
- UI (Angular): `packages/ui/`

## Implemented ✅

### Orchestration and Flows (API)

- Genkit-based flows for the end-to-end assistant:
  - customerQueryFlow: extracts user travel preferences
  - webSearchStructuredFlow: performs live Amadeus-backed research and returns structured JSON
  - destinationRecommendationFlow: recommends 3 destinations with pros/cons + rationale
  - itineraryPlanningFlow: produces a concise, day-by-day itinerary
  - travelAssistantFlow: orchestrates all steps and returns Preferences, Research, Recommendations, and Itinerary

- Amadeus integration (sandbox):
  - Activities: near-destination experiences with title, description, vendor, link, and price where available
  - Flights (sample): origin/destination, dates, airline, and price range
  - Hotels (sample): name, address, check-in/out, price, and url when available
  - Neutral, robust destination extraction (no bias); prefers explicit Destination from preferences/query

- Date handling improvements:
  - Extracts start/end dates (YYYY-MM-DD) from the user’s query when present
  - Supports month/year-only queries by constructing a deterministic date (10th of that month)
  - Falls back to ~6 weeks from now and 7-day duration when unspecified
  - Uses extracted/computed dates for both flights and hotels
  - Exposes resolved dates (startDate/endDate) in structured research output

- Destination alignment and safety:
  - travelAssistantFlow prefers destination from preferences or structured research
  - Removed the “Tokyo” default fallback; falls back to the inferred destination or a neutral default

### API Endpoints

- Health: `GET /api/health`
- Tools (disabled stub): `GET /api/tools`
- Chat (SSE streaming): `POST /api/chat`
  - Streams the orchestrated assistant response as token events
  - Final message is a single, formatted result
- Chat (JSON): `POST /api/v2/chat`
  - Returns a single JSON payload with `sections` (preferences, research, recommendations, itinerary)
- Research (structured JSON): `POST /api/research`
  - Returns `{ summary, destination?, origin?, startDate?, endDate?, results: { activities[], flights[], hotels[] } }`

### UI (Angular)

- Chat streaming UI with reasoning accordion (agent events)
- Fixed duplicate message issue
  - Only token stream appends to the main content
  - Control/complete/tool events do not append to visible content
  - Final message is formatted for readability with normalized section headers
- Research integration
  - `ApiService.fetchResearch(message)` calls `/api/research`
  - “Research” button in chat to trigger a structured research call
  - Research panel displays:
    - Destination, Origin, and Used dates (start → end)
    - Summary
    - Activities, Flights, Hotels lists (compact cards)
- Accessibility/UX touch-ups
  - Replaced clickable divs with semantic buttons
  - Fixed label associations and groupings

### UI (Assistant UI) — New

- Added a minimal Next.js app in `packages/assistant-ui/` using Assistant UI
- Uses OpenAI-compatible route at `/v1/chat/completions` (no OpenAI account required)
- Configure via `.env.local` (base URL, dummy API key, model)
- Recommended path going forward; Angular UI considered deprecated

## Configuration

- Amadeus credentials via environment variables:
  - `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` (sandbox by default)
  - Optional: `AMADEUS_HOST` (defaults to `test`)

## How to Run (local)

- From the repo root, you can use the provided scripts (see `./run.sh`) or run the API and UI in your preferred way.
- API default port: `4000`
- UI dev server: see `packages/ui/README.md`

Note: This project includes a VS Code task “Run AI Travel Agents” bound to `./run.sh`.

## Current Behavior Summary

1) User provides a freeform travel request
2) Assistant extracts preferences
3) Live research (Amadeus) returns a structured result scoped to the requested destination and timeframe
4) The assistant recommends destinations (3), then selects a best-fit destination and generates an itinerary
5) UI shows a single, de-duplicated final message, plus an optional structured research panel

## Known Issues / Next Steps

- UI polish for research panel (tabs, richer cards, pricing badges, vendor logos)
- Explicit date override in UI (quick edit of start/end dates)
- Currency selection and localization
- More robust date parsing (locale formats, natural ranges)
- Expand tests (unit/e2e) for flow correctness and edge cases
- Optional: Expose adults/rooms and trip length in the research response

## Changelog Highlights

- Replaced earlier link-only web search with Amadeus-backed structured research
- Added `/api/research` endpoint for structured JSON (activities, flights, hotels)
- Fixed duplicate final message in the UI and normalized headings
- Ensured destination alignment throughout the flow; removed “Tokyo” fallback
- Implemented per-query date extraction and exposed resolved dates to the UI
