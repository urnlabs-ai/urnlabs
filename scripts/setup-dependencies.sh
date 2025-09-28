#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi
PG_DB=${PG_DB:-${POSTGRES_DB:-urnlabs_dev}}
PG_USER=${PG_USER:-${POSTGRES_USER:-postgres}}
PG_PASSWORD=${PG_PASSWORD:-${POSTGRES_PASSWORD:-postgres}}
PGHOST=${PGHOST:-${POSTGRES_HOST:-host.docker.internal}}
PGPORT=${PGPORT:-${POSTGRES_PORT:-5432}}
REDIS_HOST=${REDIS_HOST:-${REDIS_HOST:-host.docker.internal}}
REDIS_PORT=${REDIS_PORT:-${REDIS_PORT:-6379}}

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose-dependencies.yml}
PG_CONTAINER=${PG_CONTAINER:-urnlabs-postgres}
REDIS_CONTAINER=${REDIS_CONTAINER:-urnlabs-redis}

info() { echo -e "[info]  $*"; }
ok()   { echo -e "[ ok ] $*"; }
err()  { echo -e "[fail] $*" 1>&2; }

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "Docker is required. Install Docker Desktop and retry."; exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "Docker daemon not running. Start Docker Desktop and retry."; exit 1
  fi
}

wait_for_health() {
  local name=$1; local timeout=${2:-180}; local waited=0
  info "Waiting for $name to become healthy (timeout: ${timeout}s)..."
  while true; do
    local status
    status=$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo "unknown")
    if [[ "$status" == "healthy" ]]; then ok "$name is healthy"; break; fi
    if (( waited >= timeout )); then err "$name did not become healthy in time"; return 1; fi
    sleep 3; waited=$((waited+3))
  done
}

test_pg_basic() {
  info "Testing PostgreSQL connection and basic operations..."
  docker exec -e PGPASSWORD="$PG_PASSWORD" -i "$PG_CONTAINER" \
    psql -U "$PG_USER" -d "$PG_DB" -tAc 'SELECT 1' | grep -q "1" && ok "PostgreSQL SELECT 1 ok" || {
      err "Failed basic PostgreSQL query"; return 1; }

  # Temp table + insert within session only
  docker exec -e PGPASSWORD="$PG_PASSWORD" -i "$PG_CONTAINER" \
    psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN END $$;
CREATE TEMP TABLE IF NOT EXISTS __healthcheck (id INT);
INSERT INTO __healthcheck (id) VALUES (1);
SELECT COUNT(*) FROM __healthcheck;
SQL
  ok "PostgreSQL temp table ops ok"
}

check_pg_tables() {
  info "Verifying required tables exist (users, profiles, agents, workflows)..."
  local missing=0
  for tbl in users profiles agents workflows; do
    if docker exec -e PGPASSWORD="$PG_PASSWORD" -i "$PG_CONTAINER" \
      psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT to_regclass('public.$tbl') IS NOT NULL" | grep -q "t"; then
      ok "Found table: $tbl"
    else
      err "Missing table: $tbl (ensure init.sql created it)"; missing=$((missing+1))
    fi
  done
  if (( missing > 0 )); then
    err "One or more expected tables are missing. See init.sql and re-run."; return 1
  fi
}

test_redis_basic() {
  info "Testing Redis connectivity and basic operations..."
  docker exec "$REDIS_CONTAINER" redis-cli PING | grep -qi PONG && ok "Redis PING ok" || {
    err "Redis did not respond to PING"; return 1; }
  docker exec "$REDIS_CONTAINER" sh -lc 'redis-cli SET health:check 1 >/dev/null && redis-cli GET health:check' | grep -q "1" && ok "Redis SET/GET ok" || {
    err "Redis SET/GET failed"; return 1; }
  docker exec "$REDIS_CONTAINER" redis-cli DEL health:check >/dev/null || true
}

maybe_check_ports() {
  info "Checking host ports 5432 (Postgres) and 6379 (Redis) are reachable..."
  if command -v nc >/dev/null 2>&1; then
    nc -z localhost 5432 && ok "localhost:5432 open" || err "localhost:5432 not reachable"
    nc -z localhost 6379 && ok "localhost:6379 open" || err "localhost:6379 not reachable"
  else
    info "nc not available; skipping direct host port checks"
  fi
}

main() {
  require_docker
  # Pre-check for host port conflicts
  if command -v nc >/dev/null 2>&1; then
    if nc -z localhost 5432; then
      err "Port 5432 in use"; exit 1
    fi
    if nc -z localhost 6379; then
      err "Port 6379 in use"; exit 1
    fi
  fi
  info "Starting dependency stack via $COMPOSE_FILE..."
  docker compose -f "$COMPOSE_FILE" up -d

  wait_for_health "$PG_CONTAINER" 180
  wait_for_health "$REDIS_CONTAINER" 180

  maybe_check_ports
  test_pg_basic
  test_redis_basic
  # Extra connectivity checks from container to host ports used by node services
  info "Testing container-to-host gateway connectivity (host.docker.internal) ..."
  docker exec -e PGPASSWORD="$PG_PASSWORD" -i "$PG_CONTAINER" \
    psql -h host.docker.internal -p "$PGPORT" -U "$PG_USER" -d "$PG_DB" -tAc 'SELECT 1' | grep -q "1" \
    && ok "PostgreSQL reachable at host.docker.internal:$PGPORT" || err "PostgreSQL not reachable via host.docker.internal:$PGPORT"
  docker exec "$REDIS_CONTAINER" sh -lc "redis-cli -h host.docker.internal -p $REDIS_PORT PING" | grep -qi PONG \
    && ok "Redis reachable at host.docker.internal:$REDIS_PORT" || err "Redis not reachable via host.docker.internal:$REDIS_PORT"
  # Best-effort table verification; will fail if schema not applied
  if [[ -f ./init.sql ]]; then
    check_pg_tables || true
  fi

  # Run extended connection tests
  if [[ -f scripts/test-connections.sh ]]; then
    bash scripts/test-connections.sh || true
  fi

  ok "Dependencies are ready for docker-compose-nodejs.yml (host.docker.internal:5432/6379)"
}

trap 'err "An error occurred. Use: docker compose -f $COMPOSE_FILE logs --tail=100"' ERR
main "$@"
