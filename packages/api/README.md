# AI Travel Agents API## API (Genkit + Gemini) - Quickstart



AI-powered travel planning API using **Genkit** orchestration with **Ollama** (local GPU) or **Google Gemini** (cloud) as the LLM provider.Lightweight Genkit-powered API for travel planning. Primary endpoints:



## Features- POST `/api/chat` — SSE stream (used by the UI)

- POST `/api/v2/chat` — JSON response (structured sections)

- 🤖 **Multi-Agent Architecture**: Specialized agents for flights, hotels, activities, itineraries, insights, and cost estimation- GET `/api/health` — service + web search status

- 🚀 **Ollama Integration**: Unlimited local LLM calls with GPU acceleration (no quotas!)

- ☁️ **Gemini Fallback**: Seamless switch to Google Gemini when neededCreate `.env` from `.env.sample` with your model and keys (Gemini, Amadeus if used). `npm install && npm run build && npm start` from `packages/api` starts the server.

- ✈️ **Real Travel Data**: Live flight/hotel prices from Amadeus API

- 🎯 **Smart Caching**: Redis-backed caching to minimize API callsSee top-level README for full developer guidance and deployment notes.

- 📊 **Comprehensive Analytics**: Built-in benchmarking and cost analysis tools

### MCP server (Genkit)

---

Expose these flows to MCP-aware tools (Cursor, Gemini CLI, Claude Code, Windsurf, Cline):

## Quick Start

- Build + run MCP server

### Prerequisites	- `npm run genkit:mcp:dev` (recommended)

	- or `npm run genkit:mcp`

- Node.js 20+ ([install](https://nodejs.org/))

- Ollama ([install guide](../../OLLAMA_SETUP.md))- Then point your tool to:

- Redis (optional, for caching)	- command: `genkit`

	- args: `["mcp"]`

### 1. Install Dependencies	- cwd: absolute path to `packages/api`



```bashSee `MCP.md` in this folder for detailed steps and example configs.

npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

**Minimum required variables:**
```bash
# AI Provider (choose one)
OLLAMA_URL=http://localhost:11434  # For local Ollama
# OR
# GOOGLE_GENAI_API_KEY=your_key    # For cloud Gemini

# Travel APIs (required)
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
```

### 3. Start the Server

```bash
npm start
```

The API will be available at `http://localhost:4000`

---

## API Endpoints

### Health Check
```bash
GET /api/health
```

Returns API status, provider info, and cache statistics.

### Chat (Main Endpoint)
```bash
POST /api/v2/chat
Content-Type: application/json

{
  "message": "Plan a trip from New York to Paris for 3 days starting March 1st, 2026"
}
```

Returns comprehensive travel plan with flights, hotels, activities, itinerary, insights, and cost breakdown.

### MCP Tools
```bash
GET /api/tools
```

Lists available Model Context Protocol (MCP) tools.

### Cache Management
```bash
GET /api/cache/stats      # View cache statistics
DELETE /api/cache/clear   # Clear all cached data
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Intent Router                            │
│         (Analyzes query → Routes to agents)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────▼──────────┐
         │   Master Agent       │
         │ (Orchestrator)       │
         └───────┬──────────────┘
                 │
    ┌────────────┼────────────┬──────────────┬──────────────┐
    │            │            │              │              │
┌───▼───┐   ┌───▼───┐   ┌───▼───┐   ┌─────▼─────┐  ┌────▼────┐
│Flight │   │Hotel  │   │Activities│ │Itinerary  │  │Insights │
│Agent  │   │Agent  │   │Agent     │ │Agent      │  │Agent    │
└───┬───┘   └───┬───┘   └───┬───┘   └─────┬─────┘  └────┬────┘
    │           │           │             │             │
    └───────────┴───────────┴─────────────┴─────────────┘
                            │
                   ┌────────▼────────┐
                   │Response Formatter│
                   └─────────────────┘
```

### Sub-Agents

- **Flight Agent**: Searches real flights via Amadeus API
- **Hotel Agent**: Finds accommodations with pricing
- **Activities Agent**: Discovers attractions and tours (Viator integration)
- **Itinerary Agent**: Creates day-by-day travel plans
- **Insights Agent**: Provides weather, crowd, currency, transit tips
- **Cost Agent**: Estimates total trip budget

---

## Development

### Available Scripts

#### Run & Build
```bash
npm start              # Start API server with hot reload
npm run build          # Compile TypeScript to dist/
```

#### Genkit Development
```bash
npm run genkit:dev     # Start Genkit Dev UI (http://localhost:4100)
npm run genkit:mcp     # Run as MCP server
```

#### Benchmarking
```bash
npm run benchmark              # Run full benchmark suite
npm run benchmark:cache        # Test cache performance
npm run benchmark:concurrency  # Test concurrent requests
npm run benchmark:compare      # Compare benchmark results
npm run benchmark:agents       # Compare agent performance
```

#### Analysis
```bash
npm run analyze:cache    # Analyze cache hit rates
npm run analyze:cost     # Estimate API costs
npm run analyze:logs     # Parse server logs for metrics
npm run analyze:tokens   # Analyze token usage
```

#### Testing
```bash
npm run test:query       # Send test query to running server
```

#### Visualization
```bash
npm run plot                # Plot benchmark results
npm run plot:concurrency    # Plot concurrency tests
```

---

## Configuration

### Environment Variables

See `.env.example` for all available options.

**Key configurations:**

```bash
# AI Provider Toggle
OLLAMA_URL=http://localhost:11434    # Enable Ollama
OLLAMA_MODEL=mistral                 # Model to use
# Comment out OLLAMA_URL to use Gemini instead

# Performance
REDIS_URL=redis://localhost:6379     # Enable caching

# Rate Limits (for Gemini)
AI_DAILY_LIMIT=1000
AI_MONTHLY_LIMIT=30000
```

### Switching Providers

**Use Ollama (Local)**:
```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

**Use Gemini (Cloud)**:
```bash
# OLLAMA_URL=                        # Comment out or remove
GOOGLE_GENAI_API_KEY=your_key
model=gemini-2.5-flash-lite
```

---

## Performance Optimization

### 1. Enable Redis Caching

```bash
# Start Redis
docker run -d -p 6379:6379 redis:latest

# In .env
REDIS_URL=redis://localhost:6379
```

**Cache TTLs:**
- Locations: 30 days
- Flights: 1 hour
- Hotels: 6 hours
- Activities: 24 hours

### 2. Use Ollama for Development

Ollama eliminates API quotas and reduces latency for development:

```bash
# Install and pull model
ollama pull mistral

# Set in .env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

### 3. Optimize Amadeus Calls

The system automatically batches and caches Amadeus API calls. Monitor with:

```bash
npm run analyze:cache
```

---

## Monitoring & Debugging

### View Logs

```bash
# Server logs
tail -f ../../local-reports/modified-api.log

# Parse for metrics
npm run analyze:logs
```

### Genkit Dev UI

Visual flow debugging and testing:

```bash
npm run genkit:dev
# Open http://localhost:4100
```

### Cache Statistics

```bash
curl http://localhost:4000/api/cache/stats
```

### Health Check

```bash
curl http://localhost:4000/api/health
```

---

## Troubleshooting

### "No Ollama connection"

1. Check Ollama is running: `ollama list`
2. Verify URL in `.env`: `OLLAMA_URL=http://localhost:11434`
3. Pull a model: `ollama pull mistral`

### "Amadeus API errors"

1. Verify credentials in `.env`
2. Check quota limits on [Amadeus Dashboard](https://developers.amadeus.com/)
3. Review cache stats to reduce duplicate calls

### "Redis connection failed"

Redis is optional. If not needed, remove `REDIS_URL` from `.env`. Otherwise:

```bash
docker run -d -p 6379:6379 redis:latest
```

### "Rate limit exceeded (429)"

With Ollama, this shouldn't happen. For Gemini:
1. Set `AI_DAILY_LIMIT` and `AI_MONTHLY_LIMIT` in `.env`
2. Enable Redis caching
3. Switch to Ollama for development

---

## Project Structure

```
packages/api/
├── src/
│   ├── genkit/
│   │   ├── ai.ts                    # Genkit initialization, Ollama interceptor
│   │   ├── register-flows.ts        # Flow registration
│   │   └── agents/
│   │       ├── sub-agents/          # Individual agent implementations
│   │       └── formatters/          # Response formatting
│   ├── utils/
│   │   ├── intent-router-v2.ts      # Query routing logic
│   │   ├── ollama-model.ts          # Ollama API wrapper
│   │   ├── cache.ts                 # Redis caching layer
│   │   └── request-queue.ts         # Rate limiting
│   ├── scripts/                     # Benchmarking and analysis tools
│   ├── types/                       # TypeScript type definitions
│   └── index.ts                     # Express server entry point
├── .env.example                     # Environment template
├── package.json                     # Dependencies and scripts
└── tsconfig.json                    # TypeScript configuration
```

---

## Contributing

1. Follow existing code patterns
2. Add tests for new features
3. Update documentation
4. Run benchmarks before/after changes

---

## License

See [LICENSE](../../LICENSE) for details.

---

## Links

- [Ollama Setup Guide](../../OLLAMA_SETUP.md)
- [Caching Documentation](../../CACHING.md)
- [Project Status](../../PROJECT_STATUS.md)
- [Genkit Documentation](https://firebase.google.com/docs/genkit)
