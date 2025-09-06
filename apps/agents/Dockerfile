# Multi-stage build for Agent Service
FROM node:20-alpine AS base
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY apps/agents/package.json ./apps/agents/
COPY packages/ ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS dev
WORKDIR /app/apps/agents
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

# Install pnpm and Redis CLI for health checks
RUN npm install -g pnpm && apk add --no-cache redis

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY apps/agents/package.json ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

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