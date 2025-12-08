# Setup Guide - AI Travel Agent (Phase 3)

Complete step-by-step guide for setting up and running the AI Travel Agent locally.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Detailed Setup](#detailed-setup)
4. [Configuration](#configuration)
5. [Running the Application](#running-the-application)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)
8. [Development](#development)

---

## Prerequisites

### System Requirements

- **OS**: Linux, macOS, or Windows (with WSL2)
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: 5GB free space

### Required Software

1. **Node.js 20+**
   ```bash
   # Download from https://nodejs.org/
   # Or use a version manager:
   nvm install 20
   nvm use 20
   ```
   Verify: `node --version` (should show v20.x.x)

2. **npm 10+**
   ```bash
   npm install -g npm@latest
   ```
   Verify: `npm --version`

3. **Git**
   ```bash
   # Download from https://git-scm.com/
   ```
   Verify: `git --version`

### Optional but Recommended

- **Docker & Docker Compose** (for containerized Redis and Open WebUI)
  ```bash
  # Download from https://www.docker.com/products/docker-desktop/
  ```
  Verify: `docker --version` and `docker-compose --version`

- **Redis Server** (if not using Docker)
  ```bash
  # macOS: brew install redis
  # Ubuntu: sudo apt-get install redis-server
  # Windows: Use Windows Subsystem for Linux (WSL) or docker
  ```
  Verify: `redis-cli --version`

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/abedhossainn/ai-travel-agent-phase3.git
cd ai-travel-agent-phase3
git checkout ai-travel-agent-phase3
```

### 2. Build Project

```bash
./build.sh
```

This will:
- ✅ Check prerequisites
- ✅ Install dependencies
- ✅ Compile TypeScript
- ✅ Verify build
- ✅ Create `.env` file (if missing)

### 3. Configure API Keys

Edit `packages/api/.env`:

```bash
nano packages/api/.env
```

Update with your API keys:

```env
# REQUIRED: Google Gemini API Key
GOOGLE_GENAI_API_KEY=your_actual_gemini_api_key

# OPTIONAL: Amadeus API (for live flight/hotel/activity data)
AMADEUS_CLIENT_ID=your_amadeus_client_id
AMADEUS_CLIENT_SECRET=your_amadeus_client_secret
```

### 4. Start Services

**Option A: With Docker (Recommended)**

```bash
# Start Redis and Open WebUI
docker-compose up -d

# Start API server (new terminal)
npm start -w packages/api
```

**Option B: Manual Setup**

```bash
# Terminal 1: Start Redis (if installed)
redis-server

# Terminal 2: Start API server
npm start -w packages/api
```

### 5. Verify Installation

```bash
# Test API health
curl http://localhost:4000/api/health

# Expected response:
# {"status":"OK","cache":{"connected":true},"aiProvider":{"provider":"google-genai","model":"gemini-2.5-flash-lite"}}
```

---

## Detailed Setup

### Step 1: Clone and Navigate

```bash
git clone https://github.com/abedhossainn/ai-travel-agent-phase3.git
cd ai-travel-agent-phase3
git checkout ai-travel-agent-phase3  # Switch to main development branch
```

### Step 2: Verify Prerequisites

Check that all required tools are installed:

```bash
# Check Node.js
node --version  # Should be v20.x.x or higher

# Check npm
npm --version   # Should be 10.x.x or higher

# Check Git
git --version

# Check Docker (optional)
docker --version
docker-compose --version
```

### Step 3: Run Build Script

```bash
chmod +x build.sh    # Make executable (Linux/macOS)
./build.sh           # Run build script
```

The build script will:
1. Verify all prerequisites are installed
2. Install npm dependencies for all workspaces
3. Compile TypeScript to JavaScript
4. Verify the build output (240KB+ of compiled files)
5. Check/create `.env` file
6. Display next steps

**Expected Output:**
```
[SUCCESS] Node.js v20.x.x found
[SUCCESS] npm 10.x.x found
[SUCCESS] Docker version X.X.X found (optional)
[SUCCESS] Dependencies installed
[SUCCESS] TypeScript build successful
[SUCCESS] Build verified - 29 files, size: 240K
BUILD SUCCESSFUL ✅
```

### Step 4: Manual Build (if needed)

If `build.sh` doesn't work on your system:

```bash
# Install dependencies
npm install

# Install workspace-specific dependencies
npm install -w packages/api

# Build TypeScript
npm run build -w packages/api

# Verify
ls -la packages/api/dist/  # Should contain compiled JS files
```

---

## Configuration

### Environment Variables

Create `packages/api/.env` in the API directory:

```bash
cd packages/api
cat > .env << 'EOF'
# ==========================================
# REQUIRED API KEYS
# ==========================================

# Google Gemini API Key (REQUIRED)
# Get from: https://aistudio.google.com/apikey
# Steps:
#   1. Go to https://aistudio.google.com/
#   2. Click "Get API Key"
#   3. Create a new API key
#   4. Copy and paste here
GOOGLE_GENAI_API_KEY=your_actual_gemini_api_key

# ==========================================
# OPTIONAL API KEYS
# ==========================================

# Amadeus Travel API (for real flight/hotel/activity data)
# Get from: https://developers.amadeus.com/
# Note: The app works without these using fallback data
AMADEUS_CLIENT_ID=your_amadeus_client_id
AMADEUS_CLIENT_SECRET=your_amadeus_client_secret

# ==========================================
# OPTIONAL: CACHE & DATABASE
# ==========================================

# Redis URL (defaults to localhost:6379)
# REDIS_URL=redis://localhost:6379

# ==========================================
# OPTIONAL: MODEL SELECTION
# ==========================================

# LLM Model (defaults to gemini-2.5-flash-lite)
# MODEL=gemini-2.5-flash-lite

EOF
```

### Getting API Keys

#### 1. Google Gemini API Key (REQUIRED)

```bash
# Open in browser:
https://aistudio.google.com/apikey

# Steps:
1. Sign in with Google account
2. Click "Get API Key"
3. Create new API key in default project
4. Copy the key
5. Paste in packages/api/.env as GOOGLE_GENAI_API_KEY
```

#### 2. Amadeus API Keys (OPTIONAL)

```bash
# Open in browser:
https://developers.amadeus.com/

# Steps:
1. Register for free account
2. Create a new application
3. Use "Sandbox" environment for testing
4. Get Client ID and Client Secret
5. Paste in packages/api/.env
```

---

## Running the Application

### Option A: Docker Compose (Recommended) 🐳

**Easiest way to run all services:**

```bash
# Start all services (API, Redis, Open WebUI)
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down
```

**Then start the API:**

```bash
npm start -w packages/api
```

**Access Services:**
- API: http://localhost:4000
- Open WebUI: http://localhost:8080
- Redis: localhost:6379

### Option B: Manual Setup

**Terminal 1: Start Redis**

```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server

# Windows (WSL)
wsl redis-server

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

**Terminal 2: Start API Server**

```bash
cd /path/to/ai-travel-agent-phase3
npm start -w packages/api
```

Expected output:
```
API server running on port 4000
API endpoints:
  - Health check: http://localhost:4000/api/health (GET)
  - Chat: http://localhost:4000/api/v2/chat (POST)
  - Cache logs: http://localhost:4000/api/cache/logs (GET)
```

**Terminal 3: Start Open WebUI (Optional)**

```bash
docker run -d -p 8080:8080 ghcr.io/open-webui/open-webui:latest
```

---

## Verification

### 1. Health Check

```bash
curl http://localhost:4000/api/health | jq '.'
```

Expected response:
```json
{
  "status": "OK",
  "cache": {
    "connected": true,
    "keys": 5,
    "memory": "1.2M"
  },
  "aiProvider": {
    "provider": "google-genai",
    "model": "gemini-2.5-flash-lite",
    "url": "https://generativelanguage.googleapis.com"
  }
}
```

### 2. Test Chat API

```bash
curl -X POST http://localhost:4000/api/v2/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Plan a 3-day trip from NYC to London",
    "context": {}
  }' | jq '.'
```

### 3. Check Cache

```bash
curl http://localhost:4000/api/cache/logs?limit=10 | jq '.logs[]'
```

### 4. View Logs

```bash
# Docker Compose
docker-compose logs -f api

# Manual (API terminal output)
# Should see logs with [CACHE] metrics
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 4000
lsof -i :4000

# Kill the process
kill -9 <PID>

# Or use a different port
npm start -w packages/api -- --port 5000
```

### Redis Connection Failed

```bash
# Verify Redis is running
redis-cli ping
# Should return: PONG

# If not running, start it:
# Docker:
docker run -d -p 6379:6379 redis:7-alpine

# Or set REDIS_URL in .env to disable Redis:
# REDIS_URL=redis://unavailable
```

### Missing Dependencies

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm install -w packages/api
```

### Build Errors

```bash
# Clear build artifacts
rm -rf packages/api/dist

# Rebuild
npm run build -w packages/api

# Check TypeScript errors
npx tsc --noEmit -w packages/api
```

### API Keys Not Working

1. Verify `.env` file exists: `cat packages/api/.env`
2. Check keys are not quoted: `GOOGLE_GENAI_API_KEY=actual_key_without_quotes`
3. Restart API server after changing `.env`
4. Check API logs for error messages

### Genkit Dev UI Issues

```bash
# Start Genkit development UI
cd packages/api
npm run genkit:dev

# Access at http://localhost:4100
```

---

## Development

### Project Structure

```
.
├── packages/
│   ├── api/                 # Main API server
│   │   ├── src/
│   │   │   ├── genkit/      # Genkit flows and agents
│   │   │   ├── utils/       # Cache, routing, helpers
│   │   │   └── index.ts     # Server entry point
│   │   ├── dist/            # Compiled JavaScript
│   │   └── package.json
│   ├── ui/                  # Open WebUI (Angular)
│   └── tools/               # MCP tools (optional)
├── infra/
│   ├── main.bicep           # Azure deployment
│   └── main.json
├── .github/
│   └── workflows/           # CI/CD pipelines
├── Dockerfile               # Container image
├── docker-compose.yml       # Local services
├── build.sh                 # Build script
└── README.md                # Main documentation
```

### Available Scripts

```bash
# Install all dependencies
npm install

# Build the project
npm run build

# Start API server (with watch)
npm start -w packages/api

# Run TypeScript compiler in watch mode
npm run dev -w packages/api

# Generate Genkit prompts
npm run genkit:dev -w packages/api

# Start Genkit MCP server
npm run genkit:mcp:dev -w packages/api

# Run benchmarks
npm run benchmark -w packages/api

# View cache logs via API
curl http://localhost:4000/api/cache/logs
```

### Development Workflow

```bash
# 1. Start all services
docker-compose up -d

# 2. Start API with watch mode
npm start -w packages/api

# 3. In another terminal, test API
watch -n 5 'curl http://localhost:4000/api/health | jq .'

# 4. View cache logs
curl http://localhost:4000/api/cache/logs?limit=50 | jq '.logs[]'

# 5. Check Genkit Dev UI
npm run genkit:dev -w packages/api
# Open http://localhost:4100
```

### Common Development Tasks

**Add a new dependency:**
```bash
npm install <package-name> -w packages/api
```

**Update all dependencies:**
```bash
npm update
npm update -w packages/api
```

**Check for vulnerabilities:**
```bash
npm audit
npm audit fix
```

**Format and lint code:**
```bash
npm run format  # If eslint-config is available
npm run lint
```

---

## Next Steps

After setup is complete:

1. ✅ Review [README.md](./README.md) for feature overview
2. ✅ Check [API documentation](http://localhost:4000/)
3. ✅ Explore Genkit flows in `packages/api/src/genkit/agents/`
4. ✅ Monitor cache performance via `/api/cache/logs`
5. ✅ Deploy to Azure using `./infra/main.bicep`

---

## Support & Resources

- **GitHub Issues**: https://github.com/abedhossainn/ai-travel-agent-phase3/issues
- **Genkit Docs**: https://genkit.dev/
- **Amadeus Docs**: https://developers.amadeus.com/docs
- **Google Gemini API**: https://ai.google.dev/

---

## License

This project is licensed under the MIT License. See LICENSE file for details.
