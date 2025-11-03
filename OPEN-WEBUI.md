# Open WebUI Setup

Open WebUI is now running and connected to your AI Travel Agent API.

## Access

- **URL:** http://localhost:3000
- **First Time:** You'll need to create an account (local only, stored in Docker volume)

## Configuration

The Open WebUI is pre-configured to connect to your API at `http://localhost:4000/v1`

### First Time Setup

1. Open http://localhost:3000 in your browser
2. Create an account (this is local only)
3. Go to Settings (gear icon) → Connections
4. Verify the OpenAI API connection shows your endpoint
5. In Settings → Models, select your model to start chatting

## Management

Use the provided script to manage Open WebUI:

```bash
# Start Open WebUI
./open-webui.sh start

# Stop Open WebUI
./open-webui.sh stop

# Restart Open WebUI
./open-webui.sh restart

# View logs
./open-webui.sh logs

# Check status
./open-webui.sh status

# Remove container (keeps data)
./open-webui.sh remove
```

## Requirements

- Your API server must be running on port 4000
- Docker must be installed and running

## Features

Open WebUI provides:
- ✅ Chat interface with conversation history
- ✅ Multiple conversations/threads
- ✅ Markdown rendering
- ✅ Code syntax highlighting
- ✅ File uploads (if your API supports it)
- ✅ Dark/Light themes
- ✅ Model selection
- ✅ System prompts
- ✅ Chat sharing
- ✅ Voice input (optional)

## Data Storage

All data is stored in a Docker volume named `open-webui`. This persists even if you remove the container.

To completely remove everything including data:
```bash
docker stop open-webui
docker rm open-webui
docker volume rm open-webui
```

## Troubleshooting

### Can't connect to API
Make sure your API server is running:
```bash
curl http://localhost:4000/v1/chat/completions -X POST -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"test"}]}'
```

### Check Open WebUI logs
```bash
./open-webui.sh logs
```

### Reset Open WebUI
```bash
./open-webui.sh remove
./open-webui.sh start
```
