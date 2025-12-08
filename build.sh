#!/bin/bash

# Build script for AI Travel Agent - Local Development
# This script builds and prepares the project for local deployment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 20+"
        exit 1
    fi
    NODE_VERSION=$(node -v)
    log_success "Node.js $NODE_VERSION found"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    NPM_VERSION=$(npm -v)
    log_success "npm $NPM_VERSION found"
    
    # Check Docker (optional, for Docker Compose)
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        log_success "$DOCKER_VERSION found (optional)"
    else
        log_warn "Docker not found - you'll need to install Redis manually for caching"
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    if [ ! -d "node_modules" ]; then
        log_info "Installing root dependencies..."
        npm install
    fi
    
    log_info "Installing workspace dependencies..."
    npm install -w packages/api
    
    log_success "Dependencies installed"
}

# Build TypeScript
build_typescript() {
    log_info "Building TypeScript..."
    npm run -w packages/api build
    log_success "TypeScript build successful"
}

# Verify build
verify_build() {
    log_info "Verifying build output..."
    
    if [ -d "packages/api/dist" ]; then
        BUILD_SIZE=$(du -sh packages/api/dist | cut -f1)
        FILES_COUNT=$(find packages/api/dist -type f | wc -l)
        log_success "Build verified - $FILES_COUNT files, size: $BUILD_SIZE"
    else
        log_error "Build directory not found!"
        exit 1
    fi
}

# Check environment
check_environment() {
    log_info "Checking environment configuration..."
    
    ENV_FILE="packages/api/.env"
    
    if [ ! -f "$ENV_FILE" ]; then
        log_warn "No .env file found at $ENV_FILE"
        log_info "Creating .env file with template..."
        
        cat > "$ENV_FILE" << 'ENVTEMPLATE'
# Required: Google Gemini API Key
# Get from: https://aistudio.google.com/
GOOGLE_GENAI_API_KEY=your_gemini_api_key_here

# Optional: Amadeus API credentials for live flight/hotel/activity data
# Get from: https://developers.amadeus.com/
AMADEUS_CLIENT_ID=your_amadeus_client_id_here
AMADEUS_CLIENT_SECRET=your_amadeus_client_secret_here

# Optional: Redis connection (defaults to localhost:6379)
# REDIS_URL=redis://localhost:6379

# Optional: Model selection (defaults to gemini-2.5-flash-lite)
# MODEL=gemini-2.5-flash-lite
ENVTEMPLATE
        
        log_info "Template .env file created"
        log_warn "⚠️  IMPORTANT: Update $ENV_FILE with your actual API keys!"
    else
        log_success ".env file exists"
        
        # Check if API keys are set
        if grep -q "your_gemini_api_key_here" "$ENV_FILE"; then
            log_warn "⚠️  GOOGLE_GENAI_API_KEY not configured in .env"
        else
            log_success "GOOGLE_GENAI_API_KEY is configured"
        fi
    fi
}

# Show startup instructions
show_startup_instructions() {
    cat << 'EOF'

╔════════════════════════════════════════════════════════════════════╗
║                    BUILD SUCCESSFUL ✅                            ║
╚════════════════════════════════════════════════════════════════════╝

📋 NEXT STEPS:

1️⃣  Configure Environment Variables:
    Edit packages/api/.env with your API keys:
    - GOOGLE_GENAI_API_KEY (required)
    - AMADEUS_CLIENT_ID (optional)
    - AMADEUS_CLIENT_SECRET (optional)

2️⃣  Start Services:

    Option A: With Docker Compose (recommended)
    ────────────────────────────────────────────
    docker-compose up -d
    npm start -w packages/api

    Option B: Manual Setup (Redis required locally)
    ─────────────────────────────────────────────
    # Terminal 1: Start Redis
    redis-server

    # Terminal 2: Start API server
    npm start -w packages/api

3️⃣  Access Services:
    • API: http://localhost:4000
    • Health Check: http://localhost:4000/api/health
    • Open WebUI: http://localhost:8080
    • Redis: localhost:6379

4️⃣  Test the API:
    curl http://localhost:4000/api/health

📚 Documentation:
    • Setup Guide: ./SETUP.md
    • Full README: ./README.md
    • API Endpoints: http://localhost:4000/

╔════════════════════════════════════════════════════════════════════╗

EOF
}

# Main execution
main() {
    echo ""
    log_info "Starting AI Travel Agent build process..."
    echo ""
    
    check_prerequisites
    install_dependencies
    build_typescript
    verify_build
    check_environment
    show_startup_instructions
    
    log_success "Build script completed successfully!"
}

# Run main function
main
