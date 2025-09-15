#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi
PG_DB=${PG_DB:-${POSTGRES_DB:-urnlabs_dev}}
PGUSER=${PGUSER:-${POSTGRES_USER:-postgres}}
PGPASSWORD=${PGPASSWORD:-${POSTGRES_PASSWORD:-postgres}}
PGHOST=${PGHOST:-${POSTGRES_HOST:-host.docker.internal}}
PGPORT=${PGPORT:-${POSTGRES_PORT:-5432}}
REDIS_HOST=${REDIS_HOST:-${REDIS_HOST:-host.docker.internal}}
REDIS_PORT=${REDIS_PORT:-${REDIS_PORT:-6379}}
PGDATABASE=${PGDATABASE:-$PG_DB}

# Defaults align with docker-compose-dependencies.yml
PGHOST=${PGHOST:-host.docker.internal}
PGPORT=${PGPORT:-5432}
PGDATABASE=${PGDATABASE:-urnlabs_dev}
PGUSER=${PGUSER:-postgres}
PGPASSWORD=${PGPASSWORD:-postgres}
REDIS_HOST=${REDIS_HOST:-host.docker.internal}
REDIS_PORT=${REDIS_PORT:-6379}

LOCAL_MODE=${LOCAL_MODE:-false}

info() { echo -e "[info]  $*"; }
ok()   { echo -e "[ ok ] $*"; }
err()  { echo -e "[fail] $*" 1>&2; }

FAILURES=0
fail() { err "$*"; FAILURES=$((FAILURES+1)); }

check_host_port() {
  local host=$1; local port=$2
  if command -v nc >/dev/null 2>&1; then
    nc -z "$host" "$port" && ok "$host:$port reachable" || fail "$host:$port not reachable"
  else
    info "nc not available; skipping $host:$port check"
  fi
}

test_pg_connection() {
  info "Testing PostgreSQL connection to $PGHOST:$PGPORT/$PGDATABASE as $PGUSER (ephemeral client)"
  docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:15-alpine \
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc 'SELECT 1' | grep -q "1" \
    && ok "PostgreSQL SELECT 1 ok" || fail "PostgreSQL connection failed"
}

test_pg_schema() {
  info "Checking database existence and schema (ephemeral client)..."
  docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:15-alpine \
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -tAc "SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" | grep -q "1" \
    && ok "Database $PGDATABASE exists" || fail "Database $PGDATABASE missing"

  # Basic DML in a temp table to validate write capability
  docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:15-alpine \
    sh -lc "psql -h '$PGHOST' -p '$PGPORT' -U '$PGUSER' -d '$PGDATABASE' -v ON_ERROR_STOP=1 <<'SQL'
CREATE TEMP TABLE IF NOT EXISTS __connect_test (id INT);
INSERT INTO __connect_test (id) VALUES (42);
SELECT COUNT(*) FROM __connect_test;
SQL" >/dev/null && ok "PostgreSQL DML ok" || fail "PostgreSQL DML failed"

  # Expected tables from init.sql (best-effort)
  local required=(users profiles agents workflows)
  for t in "${required[@]}"; do
    docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:15-alpine \
      psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT to_regclass('public.$t') IS NOT NULL" | grep -q "t" \
      && ok "Found table: $t" || fail "Missing table: $t"
  done
}

test_redis_connection() {
  info "Testing Redis at $REDIS_HOST:$REDIS_PORT (ephemeral client)"
  docker run --rm redis:7-alpine sh -lc "redis-cli -h $REDIS_HOST -p $REDIS_PORT PING" | grep -qi PONG \
    && ok "Redis PING ok" || fail "Redis connection failed"
  docker run --rm redis:7-alpine sh -lc "redis-cli -h $REDIS_HOST -p $REDIS_PORT SET health:check 1 >/dev/null && redis-cli -h $REDIS_HOST -p $REDIS_PORT GET health:check" | grep -q 1 \
    && ok "Redis SET/GET ok" || fail "Redis SET/GET failed"
  docker run --rm redis:7-alpine sh -lc "redis-cli -h $REDIS_HOST -p $REDIS_PORT DEL health:check >/dev/null" || true
}

test_host_gateway_resolution() {
  info "Testing TCP reachability of host.docker.internal:5432 from a container..."
  if docker run --rm alpine:3.19 sh -lc "apk add -q --no-cache busybox-extras >/dev/null && nc -z host.docker.internal 5432"; then
    ok "host.docker.internal:5432 reachable from container"
  else
    fail "host.docker.internal:5432 not reachable from container"
  fi
}

test_container_reachability() {
  info "Checking container can reach host.docker.internal:5432 and :6379 via TCP..."
  docker run --rm alpine:3.19 sh -lc "apk add -q --no-cache busybox-extras >/dev/null && nc -z host.docker.internal 5432 && nc -z host.docker.internal 6379" \
    && ok "Container can reach host.docker.internal:5432 and :6379" \
    || fail "Container cannot reach host.docker.internal ports"
}

check_env_file() {
  if [[ -f .env ]]; then
    info "Validating .env connection strings (best-effort)"
    grep -E 'DATABASE_URL|POSTGRES_|REDIS_URL|REDIS_' .env || info ".env present, but no standard DB/Redis vars found"
  else
    info ".env not found; skip env validation"
  fi
}

main() {
  check_host_port "$PGHOST" "$PGPORT"
  check_host_port "$REDIS_HOST" "$REDIS_PORT"
  test_pg_connection
  test_pg_schema || true
  test_redis_connection
  test_host_gateway_resolution || true
  test_container_reachability || true
  check_env_file

  if (( FAILURES > 0 )); then
    err "One or more tests failed ($FAILURES). See messages above."
    exit 1
  fi
  ok "All connection tests passed"
}

trap 'err "An error occurred during tests"' ERR
main "$@"
