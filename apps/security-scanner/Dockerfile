# Multi-stage build for Urnlabs Security Scanner
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    docker \
    postgresql-client \
    curl \
    bash \
    jq

# Install global dependencies for security tools
RUN npm install -g npm@latest pnpm

# Install Go for TruffleHog
RUN apk add --no-cache go && \
    go install github.com/trufflesecurity/trufflehog/v3@latest

# Install Python security tools
RUN pip3 install semgrep safety bandit

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
FROM base AS deps
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    docker \
    postgresql-client \
    curl \
    bash \
    jq \
    go

# Install security tools
RUN npm install -g npm@latest pnpm && \
    go install github.com/trufflesecurity/trufflehog/v3@latest && \
    pip3 install semgrep safety bandit

# Install CodeQL (if available)
RUN curl -L https://github.com/github/codeql-cli-binaries/releases/latest/download/codeql-linux64.tar.gz | \
    tar -xz -C /opt/ || true

# Add CodeQL to PATH if it exists
ENV PATH="/opt/codeql:${PATH}"

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S scanner -u 1001

# Copy built application
COPY --from=build --chown=scanner:nodejs /app/dist ./dist
COPY --from=build --chown=scanner:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=scanner:nodejs /app/package.json ./

# Create required directories
RUN mkdir -p logs reports security-rules && \
    chown -R scanner:nodejs logs reports security-rules

# Create security rules directory with sample configurations
RUN mkdir -p security-rules && \
    echo '{}' > security-rules/eslint-security.json && \
    echo 'extends: auto' > security-rules/custom-sast-rules.yaml && \
    echo 'extends: auto' > security-rules/custom-secret-rules.yaml

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV LOG_LEVEL=info

# Security environment variables (to be overridden at runtime)
ENV SNYK_API_KEY=""
ENV ZAP_API_KEY="changeme"
ENV ZAP_HOST="localhost"
ENV ZAP_PORT="8080"
ENV CODEQL_PATH="/opt/codeql/codeql"

# Redis configuration
ENV REDIS_HOST=localhost
ENV REDIS_PORT=6379

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Switch to non-root user
USER scanner

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/server.js"]