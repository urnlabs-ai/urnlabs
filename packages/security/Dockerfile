# Multi-stage Dockerfile for production-ready security service
FROM node:20-alpine AS base

# Install security tools and dependencies
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S security -u 1001

# Development stage
FROM base AS development
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies)
RUN pnpm install

# Copy source code
COPY src/ ./src/

# Create necessary directories with proper permissions
RUN mkdir -p logs audit-data temp && \
    chown -R security:nodejs /app

# Switch to non-root user
USER security

# Expose security service port
EXPOSE 7009

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:7009/health || exit 1

# Start development server with hot reload
CMD ["dumb-init", "pnpm", "dev"]

# Production build stage
FROM base AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY tsconfig.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN pnpm build

# Production stage
FROM base AS production
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=builder /app/dist ./dist

# Create necessary directories with proper permissions
RUN mkdir -p logs audit-data temp && \
    chown -R security:nodejs /app

# Switch to non-root user
USER security

# Expose security service port
EXPOSE 7009

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:7009/health || exit 1

# Production startup
CMD ["dumb-init", "node", "dist/server.js"]

# Default stage (development)
FROM development AS default