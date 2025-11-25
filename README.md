# AI Travel Agent — Genkit + Gemini + Open WebUI

A professional travel assistant powered by Google Genkit orchestration and Gemini 2.5 Flash, featuring real-time Amadeus API integration and intelligent response caching.

## Key Features

- **Multi-agent orchestration** with parallel sub-agents (flights, hotels, activities, recommendations, itinerary)
- **Intelligent intent routing** for optimized query handling
- **Redis-powered caching** with tiered TTL strategies (up to 6x speedup)
- **Real-time streaming** with transparent reasoning display
- **Amadeus sandbox integration** for live flight, hotel, and activity data
- **Open WebUI** with conversation management, login/sign-up, and customizable branding

## Architecture

- **Orchestrator**: Google Genkit with master-agent pattern
- **LLM Provider**: Google Gemini 2.5 Flash (≈8.8 AI calls/query)
- **API**: Node.js + Express + Genkit (port 4000)
- **Cache**: Redis 7 (port 6379) with graduated TTL policies
- **UI**: Open WebUI (port 3000) branded as "Travel Agent"
- **External APIs**: Amadeus Sandbox for flights, hotels, activities, locations

## Quick Start

### Prerequisites

- Node.js 22+ and npm
- Docker and Docker Compose
- API Keys:
  - **Google Gemini API Key** (required) — Get from [Google AI Studio](https://aistudio.google.com/)
  - **Amadeus API credentials** (optional, for live data) — Get from [Amadeus for Developers](https://developers.amadeus.com/)

### 1. Clone and Configure

```bash
git clone https://github.com/abedhossainn/azure-ai-travel-agents.git
cd azure-ai-travel-agents
# Switch to the development branch
git checkout ai-travel-agent-phase2
```

Create `packages/api/.env` with your API keys:

```bash
# Required
GOOGLE_GENAI_API_KEY=your_gemini_api_key

# Optional: Amadeus for live flight/hotel/activity data
AMADEUS_CLIENT_ID=your_amadeus_client_id
AMADEUS_CLIENT_SECRET=your_amadeus_client_secret

# Optional: Redis (defaults to localhost:6379)
REDIS_URL=redis://localhost:6379
```

### 2. Install Dependencies

```bash
cd packages/api
npm install
```

### 3. Start All Services

**Option A: Docker Compose (Recommended)**

Start Redis and Open WebUI:

```bash
cd ../..
docker-compose up -d
```

Start the API server:

```bash
cd packages/api
npm start
```

**Option B: Manual Start**

Start Redis:

```bash
docker-compose up -d redis
```

Start the API:

```bash
cd packages/api
npm start
```

### 4. Access the Application

1. Open http://localhost:3000
2. Sign up (create a local account)
3. Select the **"travel-agent"** model from the dropdown
4. Start chatting!

**Example query:**
```
I want to visit Paris in April 2025 for 5 days. Budget is $3000. I love art and food.
```

## Management Commands

### Docker Compose

```bash
# Start all services (Redis + Open WebUI)
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Restart services
docker-compose restart
```

## API Endpoints

### OpenAI-Compatible

- **GET** `/v1/models` — List available models
- **POST** `/v1/chat/completions` — Chat completions (streaming and non-streaming)

### Custom Endpoints

- **GET** `/api/health` — Health check with cache status
- **POST** `/api/v2/chat` — Structured JSON response with sections
- **POST** `/api/research` — Standalone research (flights, hotels, activities)
- **GET** `/api/cache/stats` — Cache performance metrics
- **DELETE** `/api/cache/clear` — Admin cache invalidation

## System Features

### Multi-Agent Orchestration
- **Master agent** coordinates specialized sub-agents (flights, hotels, activities, recommendations, itinerary, insights, cost)
- **Parallel execution** of external-data sub-agents for minimal latency
- **Intelligent intent routing** fast-paths simple queries vs. full orchestration
- **Type-safe flows** with Zod schema validation for all inputs/outputs

### Response Caching
- **Redis-powered** tiered caching for Amadeus API responses
- **Up to 6x speedup** for flight searches (cold: 7.8s → warm: 1.3s)
- **Graduated TTL policies** based on data volatility:
  - Locations: 24h (static reference data)
  - Activities: 6h (semi-static attractions)
  - Hotels: 3h (moderate volatility)
  - Flights: 1h (high volatility)
- **Compound cache benefits**: Location + flights cache yields 6x total speedup
- **Graceful degradation**: System continues without Redis if unavailable

### Amadeus Integration
- **Live data** for flights, hotels, activities, and location resolution (city → IATA codes)
- **Sandbox API** with best coverage for major cities (Paris, London, New York, Los Angeles)
- **Neutral destination extraction** (no hard-coded fallbacks)
- Falls back to AI estimates when data unavailable

### Real-Time Streaming
- Progressive response display with reasoning transparency
- Step-by-step workflow visibility and timing information
- **≈8.8 AI calls per query** for comprehensive multi-agent orchestration

### Open WebUI Features
- Login/sign-up with local account system (no cloud dependency)
- Conversation tabs for quick thread switching
- Per-thread model selection and adjustable generation settings
- Message edit and regenerate capabilities
- Custom branding ("Travel Agent" heading)

## Development

### Project Structure

```
packages/
  api/
    src/
      index.ts                              # Express server + API routes
      genkit/
        ai.ts                               # Genkit + Gemini configuration
        agents/
          sub-agents/                       # Specialized agent flows
            master-agent.ts                 # Master orchestrator
            flight-agent.ts, hotel-agent.ts, etc.
          formatters/
            response-formatter.ts           # Unified output formatting
      utils/
        intent-router-v2.ts                 # Intelligent query routing
        cache.ts                            # Redis cache utilities
docker-compose.yml                          # Redis + Open WebUI services
```

### Genkit Dev UI (Optional)

For debugging flows and inspecting traces:

```bash
cd packages/api
npm run genkit:dev
```

Access at http://localhost:4100

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|----------|
| `GOOGLE_GENAI_API_KEY` | Yes | Gemini API key | — |
| `AMADEUS_CLIENT_ID` | No | Amadeus client ID | (mock data) |
| `AMADEUS_CLIENT_SECRET` | No | Amadeus client secret | (mock data) |
| `REDIS_URL` | No | Redis connection string | `redis://localhost:6379` |
| `AMADEUS_HOST` | No | Amadeus environment (`test` or `production`) | `test` |

## Performance

Based on benchmark analysis (see `local-reports/report.md`):

- **Flight searches**: 6x faster with cache (7.8s → 1.3s)
- **Activities lookup**: 9.1x faster with cache (2.2s → 0.24s)
- **Location resolution**: ~2s saved per city name query (24h cache)
- **AI calls**: ≈8.8 per query (multi-agent orchestration)
- **Cost**: ~$0.00206 per query (Gemini pricing)

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a PR.

