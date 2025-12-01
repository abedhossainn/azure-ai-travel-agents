# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY packages ./packages

# Install all dependencies including devDependencies for the monorepo
# Use npm install (not ci) to work with workspaces properly
RUN npm install

# Ensure workspace-specific devDependencies (like typescript) are installed for api
RUN npm install -w packages/api

# Build the API workspace explicitly
RUN npm run -w packages/api build

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
