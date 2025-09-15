# Multi-stage build for Agent Service
FROM node:20-alpine AS base
WORKDIR /app

# Install pnpm via corepack and add build tools for native modules
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
  && apk add --no-cache python3 make g++ curl

# Copy workspace manifests first for better caching
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY apps/agents/package.json ./apps/agents/
COPY packages ./packages

# Install all workspace dependencies recursively
RUN pnpm install --frozen-lockfile --recursive

# Build workspace packages (e.g., @urnlabs/ai-agents)
RUN pnpm -r --filter "./packages/**" build

# Development stage
FROM base AS dev
WORKDIR /app/apps/agents
# Make sure the dev script can find tsx from the root node_modules
ENV PATH=/app/node_modules/.bin:$PATH
RUN which tsx || echo "tsx not found in PATH"
# Include source files so dev runs without bind-mount
COPY apps/agents/src ./src
COPY apps/agents/tsconfig.json ./
CMD ["pnpm", "dev"]

# Build stage
FROM base AS builder
WORKDIR /app/apps/agents

# Copy source files
COPY apps/agents/src ./src
COPY apps/agents/tsconfig.json ./

# Build the application
RUN pnpm build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Install pnpm via corepack and Redis CLI for health checks
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate && apk add --no-cache redis

# Copy workspace manifests and prebuilt packages from base
COPY package.json pnpm-lock.yaml* ./
COPY pnpm-workspace.yaml ./
COPY --from=base /app/packages ./packages
# Ensure app workspace folder exists and copy its package.json
RUN mkdir -p apps/agents
COPY apps/agents/package.json ./apps/agents/

# Install production dependencies for the app and packages only
RUN pnpm -r --filter "@urnlabs/agents" --filter "./packages/**" install --prod --frozen-lockfile

# Copy built application
COPY --from=builder /app/apps/agents/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S agents && adduser -S agents -u 1001
USER agents

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${AGENT_SERVICE_PORT:-3001}/health || exit 1

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/server.js"]
