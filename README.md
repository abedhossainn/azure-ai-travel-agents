# AI Travel Agent — Genkit + Gemini + Open WebUI

A professional travel assistant powered by Google Genkit and Gemini with Amadeus API integration. The system provides:
- Real-time travel preference analysis
- Live flight and hotel research via Amadeus API
- Destination recommendations with pros/cons
- Personalized day-by-day itineraries
- Streaming responses with transparent reasoning

## Architecture

- **API**: Node.js + Express + Genkit (port 4000)
- **UI**: Open WebUI (Docker container, port 3000)
- **LLM**: Google Gemini 2.5 Flash Lite
- **Data**: Amadeus Test API for flights, hotels, and activities

## Quick Start

### Prerequisites

- Node.js 22+ and npm
- Docker (for Open WebUI)
- API Keys:
  - Google Gemini API Key (required)
  - Amadeus API credentials (optional, for live data)
  - Google Custom Search (optional, for web research)

### 1. API Setup

```bash
cd packages/api
npm install
```

Edit `packages/api/.env` with your credentials:

```ini
# Required
GEMINI_API_KEY=your_gemini_api_key
model="gemini-2.5-flash-lite"

# Optional: Amadeus for live flight/hotel data
KEY=your_amadeus_client_id
SECRET=your_amadeus_client_secret

# Optional: Google Custom Search
GOOGLE_CUSTOM_SEARCH_API_KEY=your_google_api_key
GOOGLE_CUSTOM_SEARCH_CX=your_search_engine_id
```

Start the API server:

```bash
npm start
```

The API will be running at http://localhost:4000

### 2. Open WebUI Setup

Start Open WebUI with Docker:

```bash
./open-webui.sh start
```

Or manually:

```bash
docker run -d -p 3000:8080 \
  -e OPENAI_API_BASE_URL=http://host.docker.internal:4000/v1 \
  -e OPENAI_API_KEY=sk-dummy \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

### 3. Access the Application

1. Open http://localhost:3000 in your browser
2. Create a local account (first time only)
3. Select the "travel-agent" model
4. Start planning your trip!

## Managing Open WebUI

Use the included management script:

```bash
./open-webui.sh start    # Start the container
./open-webui.sh stop     # Stop the container
./open-webui.sh restart  # Restart the container
./open-webui.sh logs     # View logs
./open-webui.sh status   # Check status
./open-webui.sh remove   # Remove container (keeps data)
```

## API Endpoints

The API provides OpenAI-compatible endpoints for integration with various clients:

- **GET** `/v1/models` - List available models
- **POST** `/v1/chat/completions` - Chat completions (streaming and non-streaming)
- **GET** `/api/health` - Health check and configuration status
- **POST** `/api/v2/chat` - Alternative JSON endpoint with structured sections
- **POST** `/api/research` - Standalone research endpoint

## Features

### Real-Time Streaming
- Progressive response display
- Live reasoning transparency
- Step-by-step workflow visibility
- Timing information for each phase

### Travel Planning Workflow
1. **Preference Analysis** - Extracts destination, budget, dates, and travel style
2. **Research** - Searches Amadeus API for flights, hotels, and activities
3. **Recommendations** - Suggests 3 destinations with pros/cons analysis
4. **Itinerary** - Creates detailed day-by-day schedule with transit tips

### Amadeus Integration
- Live flight pricing and availability
- Hotel search with pricing
- Activity recommendations with descriptions
- Falls back to AI estimates when data unavailable

**Note**: Test API has limited coverage. Major cities (Paris, London, New York) work best. Production API required for comprehensive global coverage.

## Development

### Optional: Genkit Dev UI

For debugging and testing flows:

```bash
cd packages/api
npm run genkit:dev
```

Access the Genkit UI at http://localhost:4100

### Project Structure

```
packages/
  api/                 # Express API with Genkit orchestration
    src/
      index.ts         # API routes and streaming logic
      genkit/
        ai.ts          # Genkit configuration
        agents/
          flows.ts     # Individual AI flows
OPEN-WEBUI.md         # Detailed Open WebUI setup guide
open-webui.sh         # Management script for Docker container
```

## Troubleshooting

### API not responding
```bash
# Check if API is running
curl http://localhost:4000/api/health

# Check API logs
# Look for errors in the terminal where you ran npm start
```

### Open WebUI can't connect
```bash
# Check container status
./open-webui.sh status

# View logs
./open-webui.sh logs

# Restart container
./open-webui.sh restart
```

### Amadeus data not available
The test API has limited geographical coverage. This is normal for destinations outside major cities. The system will automatically fall back to AI-generated estimates.

## License

MIT — see `LICENSE.md`.

