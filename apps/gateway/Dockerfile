# Multi-stage build for Urnlabs Gateway Service
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY apps/gateway/package.json ./apps/gateway/

# Install dependencies
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Development stage
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Expose port
EXPOSE 7000

# Start development server
CMD ["pnpm", "--filter", "@urnlabs/gateway", "dev"]

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN corepack enable pnpm && pnpm --filter "@urnlabs/gateway" build

# Production stage
FROM base AS production
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 gateway

# Copy built application
COPY --from=builder --chown=gateway:nodejs /app/apps/gateway/dist ./dist
COPY --from=builder --chown=gateway:nodejs /app/apps/gateway/package.json ./package.json
COPY --from=builder --chown=gateway:nodejs /app/node_modules ./node_modules

USER gateway

EXPOSE 7000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/server.js"]