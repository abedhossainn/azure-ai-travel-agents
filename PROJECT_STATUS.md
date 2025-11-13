# Project Status — AI Travel Agents

Last updated: 2025-11-12

## Overview

Key components:

- API gateway: `packages/api/`
- Genkit flows: `packages/api/src/genkit/agents/flows.ts`
- Express routes: `packages/api/src/index.ts`
- Cache layer: `packages/api/src/utils/cache.ts` (Redis)
- UI: Open WebUI (Docker container, port 3000)

## Implemented ✅

### Response Caching (Phase 1) — NEW ✨

- **Redis-powered cache** for Amadeus API responses
- Implemented in `packages/api/src/utils/cache.ts`:
  - Connection management with graceful degradation
  - Configurable TTLs by data type
  - Cache key generation and namespacing
  - Statistics and monitoring utilities
- **Cached data types**:
  - Location coordinates (24h TTL) - static data
  - Activities (6h TTL) - semi-static data
  - Hotels (3h TTL) - moderate volatility
  - Flights (1h TTL) - high volatility
- **Performance improvements**:
  - 30-50% expected token reduction
  - 40-100x faster response for cache hits
  - Transparent to users (no UX changes)
- **Monitoring endpoints**:
  - `GET /api/cache/stats` - Cache performance metrics
  - `DELETE /api/cache/clear` - Manual cache invalidation
  - `GET /api/health` - Updated with cache status
- **Infrastructure**:
  - Docker Compose configuration (`docker-compose.yml`)
  - Redis 7 Alpine with 256MB max memory
  - LRU eviction policy for memory management
  - AOF persistence for durability

See `CACHING.md` for detailed documentation.

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

- Health: `GET /api/health` (updated with cache stats)
- Tools (disabled stub): `GET /api/tools`
- Chat (SSE streaming): `POST /api/chat`
  - Streams the orchestrated assistant response as token events
  - Real-time reasoning with timing information
  - Final message is a single, formatted result
- Chat (JSON): `POST /api/v2/chat`
  - Returns a single JSON payload with `sections` (preferences, research, recommendations, itinerary)
- Research (structured JSON): `POST /api/research`
  - Returns `{ summary, destination?, origin?, startDate?, endDate?, results: { activities[], flights[], hotels[] } }`
- Cache stats: `GET /api/cache/stats` (NEW)
  - Returns cache performance metrics
- Clear cache: `DELETE /api/cache/clear` (NEW)
  - Admin endpoint for cache invalidation
- OpenAI-compatible: `/v1/chat/completions`, `/v1/models`
  - For Open WebUI and other third-party clients

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

### UI (Open WebUI)

- Docker-based deployment (port 3000)
- OpenAI-compatible API integration
- Model selection UI with "Travel Agent" model
- Streaming response support
- Real-time reasoning display
- Thread/conversation management
- Local account system (no cloud dependency)

## Configuration

- Amadeus credentials via environment variables:
  - `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` (sandbox by default)
  - Optional: `AMADEUS_HOST` (defaults to `test`)
- Redis cache (optional):
  - `REDIS_URL` (defaults to `redis://localhost:6379`)
  - Gracefully degrades if unavailable
- Gemini API:
  - `GOOGLE_GENAI_API_KEY` (required)
  - `model` (defaults to `gemini-2.5-flash-lite`)

## How to Run (local)

1. **Start Redis cache** (optional but recommended):
   ```bash
   docker-compose up -d
   ```

2. **Start the API server**:
   ```bash
   cd packages/api
   npm install
   npm start
   ```
   API runs on port 4000.

3. **Start Open WebUI**:
   ```bash
   ./open-webui.sh start
   ```
   UI runs on port 3000.

4. **Access the application**:
   - Open http://localhost:3000
   - Create a local account (first time only)
   - Select "travel-agent" model
   - Start chatting!

**Note**: Redis is optional. The API will work without it (cache disabled mode).

## Current Behavior Summary

1. User provides a freeform travel request
2. Assistant extracts preferences (with trip duration detection)
3. Live research (Amadeus) returns a structured result scoped to the requested destination and timeframe
   - **Results are cached** based on destination, dates, and query parameters
   - Cache hits return instantly (~50ms vs. 2-5s for API calls)
4. The assistant recommends destinations (3), then selects a best-fit destination and generates an itinerary
5. Open WebUI shows real-time streaming with reasoning steps and timing information
6. Cache statistics are available via `/api/cache/stats`

## Known Issues / Next Steps

- **Phase 2 Caching**: Semantic cache for LLM responses (destination recommendations, preferences)
  - Requires vector database (Qdrant, Weavius, or pgvector)
  - Embedding model for query similarity
  - Expected additional 20-30% token reduction
- UI polish for research panel (tabs, richer cards, pricing badges, vendor logos)
- Explicit date override in UI (quick edit of start/end dates)
- Currency selection and localization
- More robust date parsing (locale formats, natural ranges)
- Expand tests (unit/e2e) for flow correctness and edge cases
- Cache analytics dashboard (hit/miss rates, cost savings visualization)
- User-triggered cache refresh ("get latest prices" button)

## Changelog Highlights

- **2025-11-12**: Implemented Phase 1 response caching with Redis
  - Added Redis Docker Compose configuration
  - Created cache utility module with TTL-based caching
  - Wrapped all Amadeus API calls (locations, activities, flights, hotels)
  - Added cache monitoring endpoints (`/api/cache/stats`, `/api/cache/clear`)
  - Updated health check to include cache status
  - Documented caching implementation in `CACHING.md`
- **2025-11-02**: Switched to Open WebUI as frontend
  - Removed Angular UI and Assistant UI
  - Implemented OpenAI-compatible API endpoints
  - Added streaming with real-time reasoning
  - Improved trip duration extraction from user queries
  - Enhanced error handling for Amadeus API
  - Removed emoji formatting for cleaner responses
- Earlier: Replaced link-only web search with Amadeus-backed structured research
- Earlier: Added `/api/research` endpoint for structured JSON (activities, flights, hotels)
- Earlier: Fixed duplicate final message in the UI and normalized headings
- Earlier: Ensured destination alignment throughout the flow; removed "Tokyo" fallback
- Earlier: Implemented per-query date extraction and exposed resolved dates to the UI
