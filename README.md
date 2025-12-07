# AI Travel Agent — Genkit + Gemini + Open WebUI

A professional travel assistant powered by Google Genkit orchestration and Gemini 2.5 Flash, featuring real-time Amadeus API integration and intelligent response caching.

**Now deployed on Azure Container Instances with automated CI/CD pipeline!**

## Key Features

- **Multi-agent orchestration** with parallel sub-agents (flights, hotels, activities, recommendations, itinerary)
- **Intelligent intent routing** for optimized query handling
- **Redis-powered caching** with tiered TTL strategies (up to 6x speedup)
- **Real-time streaming** with transparent reasoning display
- **Amadeus sandbox integration** for live flight, hotel, and activity data
- **Open WebUI** with conversation management, login/sign-up, and customizable branding
- **Azure CI/CD Deployment** with automated build, push, and container orchestration

## Architecture

- **Orchestrator**: Google Genkit with master-agent pattern
- **LLM Provider**: Google Gemini 2.5 Flash (≈8.8 AI calls/query)
- **API**: Node.js + Express + Genkit (port 4000)
- **Cache**: Redis 7 (port 6379) with graduated TTL policies
- **UI**: Open WebUI (port 8080) branded as "Travel Agent"
- **Deployment**: Azure Container Instances (ACI) on westus region
- **CI/CD**: GitHub Actions with automated build, push to ACR, and Bicep deployment
- **External APIs**: Amadeus Sandbox for flights, hotels, activities, locations

## Quick Start — Local Development

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

## Azure Deployment

### Prerequisites

- Azure subscription with westus region enabled
- Azure CLI installed
- GitHub repository access
- Docker Hub or container registry access

### Deployment Architecture

```
GitHub Workflow
    ↓
Build TypeScript (packages/api)
    ↓
Build & Push Docker Image to ACR
    ↓
Deploy Bicep Template (Container Instances)
    ↓
Live Application on Azure
```

### Configured Azure Resources

- **Container Registry (ACR)**: `travelagentacr13864.azurecr.io`
  - redis:7-alpine
  - open-webui:main
  - travel-agent-api:latest

- **Container Group**: `travel-agent-container-group`
  - 3 containers (API, Redis, WebUI)
  - Public IP with FQDN
  - Resource group: `AzureAiTravelAgentWest`
  - Region: `westus`

### CI/CD Pipeline

The repository includes automated GitHub Actions workflow (`.github/workflows/azure-deploy.yml`) that:

1. **Builds** TypeScript code
2. **Creates** Docker image from Dockerfile
3. **Pushes** image to Azure Container Registry (ACR)
4. **Deploys** Bicep infrastructure as code
5. **Outputs** access URLs

#### Required GitHub Secrets

Configure these in your GitHub repository settings:

```
AZURE_CREDENTIALS          # Service Principal credentials (JSON)
AZURE_REGISTRY_LOGIN_SERVER # ACR login server URL
AZURE_REGISTRY_USERNAME    # ACR username
AZURE_REGISTRY_PASSWORD    # ACR password
GOOGLE_GENAI_API_KEY       # Gemini API key
AMADEUS_CLIENT_ID          # Amadeus client ID
AMADEUS_CLIENT_SECRET      # Amadeus client secret
```

#### How to Deploy

1. Push to `ai-travel-agent-phase2` branch
2. GitHub Actions workflow automatically triggers
3. Deployment completes in ~5-10 minutes
4. Access your deployed application via the output URLs

### Accessing Deployed Application

After successful deployment, access via:

- **Frontend**: `http://[FQDN]:8080`
- **API**: `http://[FQDN]:4000`
- **Health Check**: `http://[FQDN]:4000/api/health`

The FQDN is provided in the GitHub Actions workflow output.

## Management Commands

### Docker Compose (Local)

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

### Azure Management

```bash
# View container status
az container show --resource-group AzureAiTravelAgentWest \
  --name travel-agent-container-group

# View container logs
az container logs --resource-group AzureAiTravelAgentWest \
  --name travel-agent-container-group --container-name api

# Restart container group
az container restart --resource-group AzureAiTravelAgentWest \
  --name travel-agent-container-group
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
infra/
  main.bicep                                # Azure infrastructure as code
.github/
  workflows/
    azure-deploy.yml                        # CI/CD pipeline
docker-compose.yml                          # Redis + Open WebUI services
Dockerfile                                  # Multi-stage build for API
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
| `GOOGLE_GENAI_API_KEY` | **Yes** | Google Gemini API key for LLM orchestration | — |
| `AMADEUS_CLIENT_ID` | **Yes** | Amadeus API client ID for flights, hotels, activities | — |
| `AMADEUS_CLIENT_SECRET` | **Yes** | Amadeus API client secret for authentication | — |
| `AMADEUS_HOST` | No | Amadeus environment (`test` or `production`) | `test` |
| `REDIS_URL` | No | Redis connection string for caching | `redis://localhost:6379` |
| `model` | No | Gemini model identifier | `gemini-2.5-flash-lite` |
| `NODE_ENV` | No | Node.js environment mode | `production` |
| `PORT` | No | API server port | `4000` |

**Note:** Without `GOOGLE_GENAI_API_KEY`, the LLM orchestration fails. Without `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET`, travel data queries return mock data only. Redis is optional but highly recommended for performance (enables response caching).

## Performance Improvements

- **Flight searches**: 6x faster with cache (7.8s → 1.3s)
- **Activities lookup**: 9.1x faster with cache (2.2s → 0.24s)
- **Location resolution**: ~2s saved per city name query (24h cache)
- **AI calls**: ≈8.8 per query (multi-agent orchestration)
- **Cost**: ~$0.00206 per query (Gemini pricing)

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a PR.