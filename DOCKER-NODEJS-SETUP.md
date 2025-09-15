# Docker Compose Node.js Stack (Health-Checked)

This guide describes the enhanced `docker-compose-nodejs.yml` setup with health checks, dependency ordering, and resilient restarts. It assumes PostgreSQL and Redis are available on `host.docker.internal` (see SETUP-DEPENDENCIES.md for provisioning options).

## Overview
- Services: API (3000) → Agents (3001) → Bridge (3002).
- Health checks: each service exposes `/health` (and `/health/ready`). Compose monitors these endpoints and restarts on failure.
- Dependency ordering: Agents waits for API to be healthy; Bridge waits for API and Agents to be healthy.
- Resilience: `restart: unless-stopped` with periodic health checks reduces race conditions and improves recovery.

## Quick Start
1) Ensure dependencies are running and reachable:
   - `bash scripts/setup-dependencies.sh`
   - `bash scripts/test-connections.sh`
2) Start the stack with health gating:
   - `docker compose -f docker-compose-nodejs.yml up -d`
   - Or stepwise validation: `bash scripts/test-stack-startup.sh`
3) Monitor health in real time:
   - `bash scripts/monitor-health-checks.sh`

## Binding and Readiness
- Binding: Services inside containers listen on all interfaces. Compose sets `HOST=0.0.0.0` so inter‑service DNS like `http://api:3000` works.
- Readiness and schema: API readiness includes schema status. `READINESS_REQUIRE_SCHEMA=true` by default in development. Set `READINESS_REQUIRE_SCHEMA=false` to allow readiness on connectivity only (not recommended for real usage).
- Post‑connect migrations: The API applies `prisma migrate deploy` after DB connectivity, with fallback to `prisma db push`. This guarantees schema is applied after the database is reachable.

Verification
- Check binding: `docker exec <api-container> ss -lntp | grep :3000`
- Cross‑service call: `docker exec <agents-container> curl -sf http://api:3000/health/ready`
- Schema tables: `psql postgresql://postgres:postgres@host.docker.internal:5432/urnlabs_dev -c "\dt"`

## Health Checks
- Compose pings each service’s `/health` every 30s with 10s timeout, 5 retries, 20s start period.
- Environment variables per service:
  - `HEALTHCHECK_URL` and `READINESS_URL` (defaults set in compose).
  - Optional: `DEPENDENCY_RETRY_MAX_ATTEMPTS`, `DEPENDENCY_RETRY_DELAY_MS` (for app-level retry logic).

## Dependency Ordering
- Agents `depends_on` API with `condition: service_healthy`.
- Bridge `depends_on` API and Agents with `condition: service_healthy`.
- External Postgres/Redis are validated by scripts before startup; applications should retry connections until available.

## Troubleshooting
- Health failing: `docker compose -f docker-compose-nodejs.yml ps` and `logs --tail=100 <service>`.
- External dependencies: re-run `scripts/test-connections.sh`; confirm ports 5432/6379 are open on the host.
- Restart loops: check env (`.env`) and DB schema (`init.sql`), then increase retry/backoff at the app level if needed.
- Healthcheck tool: Compose uses `curl` in healthchecks to decouple from Node initialization. Ensure `curl` is available in images (already included in dev targets).

## Comparison: Local vs Node.js Compose
- `docker-compose-local.yml` includes DB/Redis as containers and is best for all-in-one local dev.
- `docker-compose-nodejs.yml` uses external DB/Redis for closer-to-prod setups and lighter resource usage.

## Linux Notes
- On Linux, `host.docker.internal` may not resolve by default. The compose file maps `extra_hosts: "host.docker.internal:host-gateway"` for each service to ensure connectivity to the host.
- `scripts/test-connections.sh` uses ephemeral client containers (`postgres:15-alpine` and `redis:7-alpine`) to validate external dependencies regardless of local tooling.
