# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy packages/api package files
COPY packages/api/package*.json ./packages/api/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY packages/api ./packages/api

# Build TypeScript
WORKDIR /app/packages/api
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Copy root package files (needed for workspace resolution)
COPY package*.json ./

# Copy only production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules

# Copy built application (dist folder)
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY packages/api/package.json ./packages/api/

# Expose port
EXPOSE 4000

# Use dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the API server
WORKDIR /app/packages/api
CMD ["npm", "start"]
