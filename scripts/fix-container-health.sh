#!/usr/bin/env bash
set -euo pipefail

# Attempt to diagnose and fix common container health issues for the API
# Usage: bash scripts/fix-container-health.sh

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose-nodejs.yml}
SERVICE=${SERVICE:-api}
NETWORK=${NETWORK:-urnlabs-network}

log() { echo -e "[fix-container-health] $*"; }
hr() { printf '%.0s=' {1..80}; echo; }

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require docker

hr
log "1) Running diagnostics (debug-api-health.sh)"
bash scripts/debug-api-health.sh || true

hr
log "2) Validating external dependencies with ephemeral clients"
docker run --rm --network "${NETWORK}" --add-host host.docker.internal:host-gateway postgres:15-alpine \
  sh -lc 'PGHOST=${PGHOST:-host.docker.internal}; PGUSER=${PGUSER:-postgres}; PGPASSWORD=${PGPASSWORD:-postgres}; PGDATABASE=${PGDATABASE:-urnlabs_dev}; \
  psql "postgresql://$PGUSER:$PGPASSWORD@$PGHOST:5432/$PGDATABASE" -c "SELECT 1;"' || log "PostgreSQL check failed"

docker run --rm --network "${NETWORK}" --add-host host.docker.internal:host-gateway redis:7-alpine \
  sh -lc 'redis-cli -h host.docker.internal -p 6379 PING' || log "Redis check failed"

hr
log "3) Inspecting container env for common mismatches"
DB_URL=$(docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" sh -lc 'printf "%s" "$DATABASE_URL"' || true)
if [[ -z "${DB_URL}" ]]; then
  log "DATABASE_URL is empty in container. Ensure docker-compose-nodejs.yml sets it or use env_file: .env"
else
  log "DATABASE_URL in container: ${DB_URL}"
  if [[ "${DB_URL}" == *"@postgres:"* ]]; then
    log "Notice: DATABASE_URL points to host 'postgres'. For docker-compose-nodejs.yml (external DB mode), 'host.docker.internal' is typical."
  fi
fi

hr
log "4) Attempting prisma checks (generate, migrate deploy, fallback db push)"
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" sh -lc '
  set -e; \
  pnpm exec prisma generate && \
  pnpm exec prisma migrate deploy || pnpm exec prisma db push || true; \
  node -e "(async()=>{try{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();await p.$queryRaw`SELECT 1`;console.log('Post-migration SELECT 1: OK');await p.$disconnect();}catch(e){console.log('Post-migration SELECT 1: FAIL', e?.message||e)}})();";
' || true

hr
log "5) Restarting the API service to apply changes"
docker compose -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate "${SERVICE}" || true

sleep 3
log "6) Waiting for health (up to ~2 minutes)"
ATTEMPTS=24
for i in $(seq 1 $ATTEMPTS); do
  STATUS=$(docker compose -f "${COMPOSE_FILE}" ps --format json "${SERVICE}" | jq -r '.[0].State.Health.Status' 2>/dev/null || echo "unknown")
  if [[ "${STATUS}" == "healthy" ]]; then
    log "Service is healthy"
    break
  fi
  log "Attempt $i/$ATTEMPTS: status=${STATUS}"
  sleep 5
done

hr
log "7) Final diagnostics"
bash scripts/debug-api-health.sh || true

log "Done. If the service remains unhealthy, verify DATABASE_URL host matches your setup (host.docker.internal vs postgres), then rerun."

