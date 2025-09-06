FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
COPY packages/monitoring/package.json ./packages/monitoring/
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 7006
CMD ["pnpm", "--filter", "@urnlabs/monitoring", "dev"]

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm --filter "@urnlabs/monitoring" build

FROM base AS production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 monitoring
COPY --from=builder --chown=monitoring:nodejs /app/packages/monitoring/dist ./dist
COPY --from=builder --chown=monitoring:nodejs /app/packages/monitoring/package.json ./package.json
COPY --from=builder --chown=monitoring:nodejs /app/node_modules ./node_modules
USER monitoring
EXPOSE 7006
CMD ["node", "dist/server.js"]