# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed with `pnpm` workspaces.
- Websites: `worktrees/urnlabs-ai` (Astro), `worktrees/usmanramzan-ai`, `worktrees/eprecisio-com`, shared UI in `worktrees/shared-components` and `worktrees/design-system`.
- Packages: `packages/ai-agents` (TypeScript library, Vitest, tsup), `packages/config` (shared ESLint/TS/Tailwind configs), `packages/mcp-integration`, `packages/monitoring`, `packages/security`, `packages/testing`, `packages/ui`.
- Ops: `docker/`, `docker-compose*.yml`, `DOCKER.md`, `DOCKER-COMPOSE-LOCAL.md`, `init.sql`.
- Scripts: `scripts/` automation; root docs in `README.md`.

## Build, Test, and Development Commands
- Install: `pnpm install`
- Run URNLabs site: `pnpm dev:urnlabs` or `cd worktrees/urnlabs-ai && pnpm dev`
- Build all sites: `pnpm build:all`
- Build AI agents lib: `pnpm -w --filter @urnlabs/ai-agents build`
- Lint (site): `cd worktrees/urnlabs-ai && pnpm lint`
- Type-check (site): `cd worktrees/urnlabs-ai && pnpm typecheck`
- Local Docker stack: `docker compose -f docker-compose-local.yml up --build` (see `DOCKER-COMPOSE-LOCAL.md`).

## Coding Style & Naming Conventions
- Language: TypeScript preferred; Astro + React for sites.
- Indentation: 2 spaces; no trailing whitespace.
- Linting/formatting: shared config via `@urnlabs/config` (ESLint + Prettier compatibility, Astro rules). Fix with `pnpm lint:fix` where available.
- Naming: Components `PascalCase.tsx/.astro`; files/dirs `kebab-case`; types/interfaces `PascalCase`; constants `UPPER_SNAKE_CASE`.
- Imports: in `packages/ai-agents`, aliases `@` and `@tests` are configured.

## Testing Guidelines
- Framework: Vitest in `packages/ai-agents`.
- Layout: `src/__tests__/**/*.{test,spec}.ts`.
- Run: `pnpm -w --filter @urnlabs/ai-agents test`; coverage: `pnpm -w --filter @urnlabs/ai-agents test:coverage`.
- Coverage thresholds: 80% lines/branches/functions/statements (see `packages/ai-agents/vitest.config.ts`).
- Prefer fast unit tests; isolate integration tests with `test:integration`. Mock network/API keys by default.

## Commit & Pull Request Guidelines
- Commits: concise, imperative, scoped. Examples:
  - `Fix Dockerfile PATH for dev scripts`
  - `Add shared ESLint config and docs`
- PRs must include: clear description, linked issues, screenshots for UI changes, test plan/coverage notes, and any Docker/env impacts. Keep PRs focused and small.

## Security & Configuration
- Secrets: never commit. Copy `.env.example` to `.env` locally; document new keys.
- Docker: prefer local compose files; do not push registry credentials.
- Data: seed/init SQL lives in `init.sql`; review before applying.

---

# AI Agents Service and Library

## Overview
- `apps/agents`: Long-running service that orchestrates AI agents, executes workflows, manages queues, and exposes REST + WebSocket APIs.
- `packages/ai-agents`: Reusable TypeScript library with agent abstractions and provider integrations (Claude/OpenAI).

## Run Modes
- Unified local stack: `docker compose -f docker-compose-local.yml up -d`
- Node.js-only stack (API + Agents + Bridge):
  - Provision Postgres/Redis: `bash scripts/setup-dependencies.sh`
  - Start: `docker compose -f docker-compose-nodejs.yml up -d`
  - Monitor: `bash scripts/monitor-health-checks.sh`
  - Troubleshoot: `bash scripts/debug-api-health.sh`

## Environment Variables
- Common: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (API), `CLAUDE_API_KEY` (optional), `OPENAI_API_KEY` (optional)
- Agents: `AGENT_SERVICE_PORT` (default 3001), `NODE_ENV`, `LOG_LEVEL`
- Library: typically consumes provider keys via process env.

## Agents Service API
- Base URL: `http://localhost:3001`
- Health:
  - `GET /health` → basic
  - `GET /health/detailed` → queue + WS + orchestrator stats
- Agents:
  - `GET /agents/status` → list agents (name, type, status, capabilities)
  - `GET /agents/tasks` → running tasks
- Workflows:
  - `POST /workflows/execute` → start a workflow run
  - `GET /workflows/:workflowRunId/status` → poll status
  - `POST /workflows/:workflowRunId/cancel` → cancel

## Health Checks and Debugging
- Compose health checks hit `/health` or `/health/ready` (API). If unhealthy:
  - `bash scripts/debug-api-health.sh` to inspect env, connectivity, Prisma, and endpoints
  - `bash scripts/fix-container-health.sh` to attempt migrations and restart
  - See `TROUBLESHOOTING-DOCKER.md` for common issues

## Packages/Library Development
- Build: `pnpm -w --filter @urnlabs/ai-agents build`
- Tests: `pnpm -w --filter @urnlabs/ai-agents test` (or `test:coverage`)
- Typecheck: `pnpm -w --filter @urnlabs/ai-agents typecheck`

## Notes
- Linux: `host.docker.internal` is mapped via `extra_hosts` in Compose for host DB/Redis access.
- Migrations: API applies migrations on boot in dev mode; ensure DB is reachable.
