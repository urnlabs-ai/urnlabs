AI Agents Service

Overview
- Orchestrates AI agents and workflows with queues, Prisma-backed state, and WebSocket updates.
- Exposes REST endpoints for health, agent status, and workflow execution.

Run Options
- Local stack (includes DB/Redis): `docker compose -f ../../docker-compose-local.yml up -d`
- Node.js-only stack (external DB/Redis):
  - `bash ../../scripts/setup-dependencies.sh`
  - `docker compose -f ../../docker-compose-nodejs.yml up -d agents`
  - `bash ../../scripts/monitor-health-checks.sh`

Environment
- `DATABASE_URL`: Postgres connection string (e.g., postgresql://postgres:postgres@host.docker.internal:5432/urnlabs_dev)
- `REDIS_URL`: Redis connection (e.g., redis://host.docker.internal:6379)
- `AGENT_SERVICE_PORT`: Default 3001
- Optional: `CLAUDE_API_KEY`, `OPENAI_API_KEY`

Endpoints
- Health: `GET /health`, `GET /health/detailed`
- Agents: `GET /agents/status`, `GET /agents/tasks`
- Workflows: `POST /workflows/execute`, `GET /workflows/:workflowRunId/status`, `POST /workflows/:workflowRunId/cancel`

Development
- Install: `pnpm install`
- Dev server: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

Troubleshooting
- Verify DB/Redis reachability from container using `scripts/test-connections.sh`.
- If starting via Node.js stack compose, ensure `DATABASE_URL`/`REDIS_URL` point to host services or use the full local compose with embedded dependencies.
- See `TROUBLESHOOTING-DOCKER.md` for debugging Prisma and health checks.

