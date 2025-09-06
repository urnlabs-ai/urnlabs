FROM node:20-alpine AS base
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
COPY packages/mcp-integration/package.json ./packages/mcp-integration/
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 7007
CMD ["pnpm", "--filter", "@urnlabs/mcp-integration", "dev"]