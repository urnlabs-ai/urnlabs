Docker Troubleshooting Guide

This guide helps diagnose and fix container health issues, especially when the API starts but fails readiness checks due to database connectivity or Prisma initialization.

Common Issues and Solutions
- API unhealthy: Usually a database connectivity or schema issue. Run `bash scripts/debug-api-health.sh` to gather details.
- DATABASE_URL mismatch: Ensure the hostname matches your mode:
  - External DB (docker-compose-nodejs.yml): use `host.docker.internal`.
  - Local DB in compose (docker-compose-local.yml): use the service name, e.g., `postgres`.
- Prisma errors: Run `pnpm exec prisma generate` and then `prisma migrate deploy` (or `prisma db push`) inside the container.
- Missing schema: Apply migrations or run `init.sql` (for bare Postgres).

Health Check Debugging
- Inside container: `docker compose -f docker-compose-nodejs.yml exec api sh -lc "node -e 'fetch(\"http://localhost:3000/health/ready\").then(r=>console.log(r.status)).catch(e=>console.log(e.message))'"`
- Logs: `docker compose -f docker-compose-nodejs.yml logs --tail=200 api`
- Endpoints: `/health`, `/health/ready`, `/health/detailed` provide increasing detail.

Environment Configuration
- Compose overrides `.env` unless you reference `${VARS}` directly. Prefer `DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@host.docker.internal:5432/urnlabs_dev}` in compose to allow `.env` to override defaults.
- Required: `DATABASE_URL`, `JWT_SECRET`. Optional: `REDIS_URL`, `CLAUDE_API_KEY`, etc.

Database and Prisma
- Quick connectivity: `psql postgresql://postgres:postgres@host.docker.internal:5432/urnlabs_dev -c "SELECT 1;"`
- In-container: `pnpm exec prisma generate` then `pnpm exec prisma migrate deploy` (fallback `pnpm exec prisma db push`).
- Check tables: `SELECT to_regclass('public.users'), to_regclass('public.agents'), to_regclass('public.workflows');`

Network and Connectivity
- `host.docker.internal` may require extra host mapping on Linux; compose includes `extra_hosts: host.docker.internal:host-gateway` per service.
- Validate from the same network using ephemeral clients:
  - Postgres: `docker run --rm --network urnlabs-network --add-host host.docker.internal:host-gateway postgres:15-alpine psql postgresql://postgres:postgres@host.docker.internal:5432/urnlabs_dev -c "SELECT 1;"`
  - Redis: `docker run --rm --network urnlabs-network --add-host host.docker.internal:host-gateway redis:7-alpine redis-cli -h host.docker.internal -p 6379 PING`

Monitoring and Logging
- Real-time health: `bash scripts/monitor-health-checks.sh`
- Stepwise startup: `bash scripts/test-stack-startup.sh`

Prevention and Best Practices
- Make readiness checks verify DB connectivity (`SELECT 1`) and return 503 on failure.
- Parameterize external dependencies and allow `.env` to override defaults in compose.
- Run migrations automatically on container start in dev, and gate API startup on DB readiness.

