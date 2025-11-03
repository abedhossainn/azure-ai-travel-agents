#!/bin/bash

# Open WebUI Management Script

case "$1" in
  start)
    echo "Starting Open WebUI..."
    docker start open-webui 2>/dev/null || \
    docker run -d -p 3000:8080 \
      -e OPENAI_API_BASE_URL=http://host.docker.internal:4000/v1 \
      -e OPENAI_API_KEY=sk-dummy \
      --add-host=host.docker.internal:host-gateway \
      -v open-webui:/app/backend/data \
      --name open-webui \
      --restart always \
      ghcr.io/open-webui/open-webui:main
    echo "Open WebUI is running at http://localhost:3000"
    ;;
  stop)
    echo "Stopping Open WebUI..."
    docker stop open-webui
    ;;
  restart)
    echo "Restarting Open WebUI..."
    docker restart open-webui
    ;;
  logs)
    docker logs -f open-webui
    ;;
  status)
    docker ps -a | grep open-webui
    ;;
  remove)
    echo "Removing Open WebUI container..."
    docker stop open-webui 2>/dev/null
    docker rm open-webui 2>/dev/null
    echo "Container removed. Data is preserved in Docker volume 'open-webui'"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|logs|status|remove}"
    echo ""
    echo "Commands:"
    echo "  start   - Start Open WebUI container"
    echo "  stop    - Stop Open WebUI container"
    echo "  restart - Restart Open WebUI container"
    echo "  logs    - Show container logs"
    echo "  status  - Show container status"
    echo "  remove  - Remove container (keeps data)"
    exit 1
    ;;
esac
