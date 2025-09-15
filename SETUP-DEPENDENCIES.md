# External Dependencies Setup (PostgreSQL & Redis)

This guide prepares external PostgreSQL and Redis for the `docker-compose-nodejs.yml` stack, which expects services at `host.docker.internal:5432` and `host.docker.internal:6379`. Containers may start and immediately exit if these are missing. For a full local stack, prefer `docker-compose-local.yml`.

## Quick Start
1. Start dependencies only:
   - `docker compose -f docker-compose-dependencies.yml up -d`
   - Or: `bash scripts/setup-dependencies.sh` (includes health waits and tests)
2. Verify connectivity:
   - `bash scripts/test-connections.sh`
3. Start your Node.js stack:
   - `docker compose -f docker-compose-nodejs.yml up -d`

## What’s the Difference?
- `docker-compose-nodejs.yml`: Node containers only. Requires external Postgres/Redis on host via `host.docker.internal`.
- `docker-compose-local.yml`: Complete local setup including Postgres/Redis as containers (recommended for most development).

## Connection Strings
- PostgreSQL: `postgresql://postgres:postgres@host.docker.internal:5432/urnlabs_dev`
- Redis: `redis://host.docker.internal:6379`
Define these in `.env` as needed (e.g., `DATABASE_URL`, `REDIS_URL`).

## Environment Variables
The dependency stack reads credentials from `.env`:
- `POSTGRES_DB` (default: `urnlabs_dev`)
- `POSTGRES_USER` (default: `postgres`)
- `POSTGRES_PASSWORD` (default: `postgres`)
These are consumed by `docker-compose-dependencies.yml` via `env_file: .env`.

## Manual Host Install (Alternative)
- Install PostgreSQL 15 and Redis 7 locally, create DB `urnlabs_dev`, user `postgres`/`postgres`.
- Ensure services listen on localhost and ports 5432/6379 are free.
- Apply schema: `psql -U postgres -d urnlabs_dev -f init.sql`.

## Troubleshooting
- Ports in use: the setup script now exits early if `5432` or `6379` are occupied. Stop local DB/Redis services or change port mappings in `docker-compose-dependencies.yml`, then rerun the script.
- Health checks failing: `docker compose -f docker-compose-dependencies.yml logs --tail=100`.
- `host.docker.internal` issues: verify Docker Desktop; use `scripts/test-connections.sh` to validate TCP reachability from a container.
- Schema missing: confirm `init.sql` mounted and executed; re-create Postgres volume if needed.

For full-stack local development without external dependencies, switch to `docker-compose-local.yml` and follow `DOCKER-COMPOSE-LOCAL.md`.
