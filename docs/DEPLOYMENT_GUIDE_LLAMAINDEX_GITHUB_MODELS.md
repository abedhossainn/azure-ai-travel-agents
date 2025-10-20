# Azure AI Travel Agents - Simplified Chat Deployment Guide

**Last Updated**: October 19, 2025  
**Status**: Production-Ready (Local Deployment)  
**Architecture**: Simplified Direct LLM Chat  
**LLM Provider**: GitHub Models API (gpt-4o-mini)  
**API Client**: Direct OpenAI Client (no LlamaIndex or LangChain middleware)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [What's New](#whats-new)
3. [Prerequisites](#prerequisites)
4. [Environment Setup](#environment-setup)
5. [GitHub Models API Configuration](#github-models-api-configuration)
6. [Local Deployment](#local-deployment-docker-compose)
7. [Verification & Testing](#verification--testing)
8. [Architecture Overview](#architecture-overview)
9. [Troubleshooting](#troubleshooting)
10. [Azure Cloud Deployment](#azure-cloud-deployment-optional)

---

## Quick Start

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/azure-ai-travel-agents.git
cd azure-ai-travel-agents

# Set GitHub token
export GITHUB_TOKEN="ghp_YOUR_TOKEN_HERE"
export GITHUB_MODEL="gpt-4o-mini"

# Start all services
cd packages
docker-compose up -d

# Verify deployment
curl http://localhost:4000/api/health
```

Frontend: Open [http://localhost:4200](http://localhost:4200) in your browser

---

## What's New (October 19, 2025)

### Simplified Architecture

- **Removed**: Complex LlamaIndex/LangChain orchestration
- **Removed**: Multi-agent routing system
- **Added**: Direct OpenAI API client for simple, fast responses
- **Result**: Faster, more reliable, easier to debug

### Current Implementation

- Single Express.js API endpoint
- Direct GitHub Models API integration
- No MCP tool orchestration (tools still available but optional)
- Simple SSE streaming to frontend
- ~100ms response time (vs 5-10s with agent orchestration)

### Files Changed

- `packages/api/src/index.ts` - Simplified chat endpoint
- Removed: Complex agent setup logic
- Removed: MCP tool integration from chat flow

---

## Prerequisites

### System Requirements
- **OS**: Windows 10+, macOS, or Linux
- **Docker Desktop**: v28.3.2 or higher (with Docker Compose v2.20+)
- **Node.js**: v22.16+ (for local development)
- **Git**: Latest version
- **RAM**: Minimum 8GB (recommended 16GB)
- **Disk**: 20GB free space (for Docker images)

### GitHub Account Requirements
- GitHub account with API access
- Personal Access Token (Classic) with proper scopes

### Installed Tools
```bash
# Verify prerequisites
docker --version          # Docker Desktop v28.3.2+
docker-compose --version  # Docker Compose v2.20+
node --version           # v22.16+
git --version            # Latest
```

---

## Environment Setup

### Step 1: Create GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Set **Token name**: `ai-travel-agents-api`
4. Set **Expiration**: 90 days (or as per your policy)
5. **Select scopes**:
   -`repo` (Full control of private repositories)
   -`read:packages` (Read packages)
   -`write:packages` (Write packages)
6. Click **"Generate token"**
7. **Copy the token** (you won't see it again!)

**Important**: Use a **Classic** token, not a fine-grained token. GitHub Models API requires classic PAT tokens.

### Step 2: Configure Environment Variables

Navigate to `packages/api/` and update `.env.docker`:

```bash
cd packages/api
cp .env.sample .env.docker
```

**Edit `.env.docker`**:

```env
# ============ LLM Configuration ============
LLM_PROVIDER=github-models
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Your GitHub PAT token
GITHUB_MODEL=gpt-4o-mini

# ============ API Configuration ============
NODE_ENV=production
PORT=4000
LOG_LEVEL=info

# ============ MCP Tool Services ============
# These point to Docker container hostnames (not localhost)
MCP_CUSTOMER_QUERY_URL=http://tool-customer-query:5001
MCP_DESTINATION_RECOMMENDATION_URL=http://tool-destination-recommendation:5002
MCP_ITINERARY_PLANNING_URL=http://tool-itinerary-planning:5003

# ============ Service Ports ============
CUSTOMER_QUERY_PORT=5001
DESTINATION_RECOMMENDATION_PORT=5002
ITINERARY_PLANNING_PORT=5003

# ============ Orchestration ============
VERBOSE_LOGGING=false
```

### Step 3: Verify Token Format

The token should start with `ghp_` followed by 36 alphanumeric characters:

```
ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789
```

---

## GitHub Models API Configuration

### Supported Models

GitHub Models API provides free access to several models:

| Model | Status | Use Case |
|-------|--------|----------|
| `gpt-4o-mini` | Recommended | Cost-effective, good for travel planning |
| `gpt-4o` | Available | More powerful, higher token usage |
| `claude-3.5-sonnet` | Available | Strong reasoning capabilities |
| `phi-4` | Limited | Fast inference |

### Rate Limits

- **Requests**: 60 per minute per user
- **Tokens**: 150,000 tokens per day
- **Concurrent**: 1 concurrent request per app

### Pricing

**Free** for GitHub users with verified account.

### Testing Your Token

Before deployment, verify your token works:

```bash
curl -X POST https://models.inference.ai.azure.com/chat/completions \
  -H "Authorization: Bearer ghp_YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "model": "gpt-4o-mini",
    "temperature": 0.7
  }'
```

Expected response: JSON with `choices[0].message.content`

---

## Local Deployment (Docker Compose)

### Step 1: Start All Services

```bash
cd packages
docker-compose up -d

# Watch services start (takes 30-60 seconds)
docker-compose logs -f web-api
```

### Step 2: Verify Services Are Running

```bash
# Check all containers
docker-compose ps
```

### Step 3: Verify Connectivity

```bash
# Check API health
curl http://localhost:4000/api/health

# Check MCP services
curl http://localhost:5001/health  # Customer Query
curl http://localhost:5002/health  # Destination Recommendation
curl http://localhost:5003/health  # Itinerary Planning
```

All should return `200 OK`.

### Step 4: Access the Frontend

Open your browser:
```
http://localhost:4200
```

Wait for the Angular app to load (first load may take 10-15 seconds).

---

## Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       User Browser                              │
│                    (Angular Frontend)                           │
│                   http://localhost:4200                         │
└────────────────────────┬────────────────────────────────────────┘
                         │ SSE (Server-Sent Events)
                         │ /api/chat
┌────────────────────────▼────────────────────────────────────────┐
│                 Express.js API Gateway                          │
│              (Port 4000 - node:22-alpine)                       │
│                                                                 │
│         Direct GitHub Models Integration                       │
│         (Simple chat endpoint, no agents)                       │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ HTTPS
                         │
            ┌────────────────────────┐
            │   GitHub Models API    │
            │   (gpt-4o-mini)        │
            │  Cloud-based LLM       │
            └────────────────────────┘
```

### Component Details

#### API Gateway

- **Runtime**: Node.js v22 (Alpine)
- **Framework**: Express.js + TypeScript
- **LLM Integration**: Direct OpenAI client
- **Response Format**: Server-Sent Events (SSE)
- **Port**: 4000

#### LLM Provider: GitHub Models

- **Endpoint**: `https://models.inference.ai.azure.com/chat/completions`
- **Model**: `gpt-4o-mini` (configurable)
- **Authentication**: Personal Access Token (Classic)
- **Type**: Cloud-based API
- **Cost**: Free tier available
- **Rate Limits**: 60 requests/min, 150K tokens/day

#### MCP Tool Servers (Optional)

| Service | Language | Port | Status | Purpose |
|---------|----------|------|--------|---------|
| customer-query | C#/.NET | 5001 | Active | Analyze customer preferences |
| destination-recommendation | Java | 5002 | Active | Suggest travel destinations |
| itinerary-planning | Python | 5003 | Active | Create detailed travel plans |
| echo-ping | TypeScript | 5007 | Optional | Health check / testing |
| web-search | TypeScript | 5006 | Optional | Bing search integration |
| code-evaluation | Python | 5004 | Optional | Code execution |
| model-inference | Python | 5005 | Optional | Local LLM inference |

### Data Flow

1. **User Input** → Angular frontend sends message via SSE
2. **API Gateway** → Express receives POST to `/api/chat`
3. **Direct LLM Call** → GitHub Models API generates response
4. **Event Streaming** → Response streamed back via SSE
5. **Frontend Display** → Angular renders response in chat UI

---

### Quick Deploy

```bash
cd infra

# Set variables
$resourceGroup = "ai-travel-agents-rg"
$location = "eastus"
$registryName = "youracrname"

# Create resource group
az group create \
  --name $resourceGroup \
  --location $location

# Deploy Bicep template
az deployment group create \
  --resource-group $resourceGroup \
  --template-file main.bicep \
  --parameters \
    environment=prod \
    registry=$registryName \
    githubToken=$(cat ~/.github/token.txt)
```

For detailed Azure deployment instructions, see [`docs/deployment-architecture.md`](deployment-architecture.md).

---

## Support & Debugging

### Useful Commands

```bash
# View all service logs
docker-compose logs --tail=50

# Follow API logs in real-time
docker-compose logs -f web-api

# Restart specific service
docker-compose restart web-api

# Rebuild without cache
docker-compose build --no-cache web-api

# Remove all containers and volumes
docker-compose down -v
```

### Debug Endpoints

```bash
# Health check
GET http://localhost:4000/api/health

# List available tools
GET http://localhost:4000/api/tools

# Stream debug events (test SSE)
POST http://localhost:4000/api/chat
Body: {"message":"test","debug":true}
```

### Log Levels

Set in `.env.docker`:
```env
LOG_LEVEL=debug   # Verbose logging
LOG_LEVEL=info    # Normal (default)
LOG_LEVEL=error   # Errors only
```

---

## Next Steps

1. Fork repository to your GitHub account
2. Deploy locally with this guide
3. **Test** the deployment thoroughly
4. **Extend** by adding custom agents or tools
5. **Deploy** to Azure using Bicep templates (see `infra/` directory)
6. **Monitor** using Azure Container Apps and Application Insights

---

## References

- [LlamaIndex.TS Documentation](https://docs.llamaindex.ai/)
- [GitHub Models API](https://github.com/marketplace/models)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [Docker Compose Reference](https://docs.docker.com/compose/reference/)
- [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/)

---

**Questions?** Check the main [`README.md`](../README.md) or review the architecture docs in [`docs/`](../docs/).

