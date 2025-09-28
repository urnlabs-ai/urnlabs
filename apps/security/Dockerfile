# Multi-stage build for Urnlabs Security Service
FROM node:20-alpine AS base

# Install security updates and tools
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create app directory and user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S security -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Development stage
FROM base AS development
ENV NODE_ENV=development
RUN npm ci --include=dev
COPY . .
RUN npm run build
USER security
EXPOSE 7009
CMD ["dumb-init", "npm", "run", "dev"]

# Production dependencies stage
FROM base AS deps
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force

# Production build stage
FROM base AS build
ENV NODE_ENV=production
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S security -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=security:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=security:nodejs /app/dist ./dist
COPY --from=build --chown=security:nodejs /app/package.json ./

# Copy database migrations
COPY --from=build --chown=security:nodejs /app/migrations ./migrations

# Security hardening
RUN chmod -R 755 /app && \
    chown -R security:nodejs /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:7009/health || exit 1

# Use non-root user
USER security

# Expose port
EXPOSE 7009

# Set production environment
ENV NODE_ENV=production

# Use dumb-init to handle signals properly
CMD ["dumb-init", "node", "dist/server.js"]

# Labels for metadata
LABEL maintainer="Urnlabs AI <dev@urnlabs.ai>"
LABEL version="1.0.0"
LABEL description="Enterprise Security Framework with JWT Auth, RBAC, and Audit Logging"
LABEL org.opencontainers.image.source="https://github.com/urnlabs/urnlabs"
LABEL org.opencontainers.image.title="Urnlabs Security Service"
LABEL org.opencontainers.image.description="Production-ready security service with enterprise features"
LABEL org.opencontainers.image.version="1.0.0"