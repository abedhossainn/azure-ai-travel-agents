# Multi-stage build for optimal image size
# Railway Production Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY packages ./packages

# Install all dependencies including devDependencies
# Use npm install (not ci) to work with workspaces properly
RUN npm install

# Build TypeScript from packages/api
WORKDIR /app/packages/api
RUN npm run build && \
    echo "=== Build complete, listing dist contents ===" && \
    ls -laR dist/

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Copy root package files and workspace structure
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules

# Copy built application (dist folder only, not source)
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Expose port
EXPOSE 4000

# Use dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the API server directly with node (avoid workspace resolution issues)
WORKDIR /app/packages/api
CMD ["node", "dist/index.js"]
