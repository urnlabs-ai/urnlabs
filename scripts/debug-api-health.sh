#!/usr/bin/env bash
set -euo pipefail

# Debug API container health and dependencies
# Usage: bash scripts/debug-api-health.sh

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose-nodejs.yml}
SERVICE=${SERVICE:-api}
CONTAINER_NAME=${CONTAINER_NAME:-urnlabs-api}
NETWORK=${NETWORK:-urnlabs-network}

log() { echo -e "[debug-api-health] $*"; }
hr() { printf '%.0s-' {1..80}; echo; }

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require docker

log "Compose file: ${COMPOSE_FILE} | service: ${SERVICE} | network: ${NETWORK}"
hr

log "Container status"
docker compose -f "${COMPOSE_FILE}" ps "${SERVICE}" || true
hr

log "Recent container logs (last 120 lines)"
docker compose -f "${COMPOSE_FILE}" logs --tail=120 "${SERVICE}" || true
hr

log "Selected environment inside container"
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" sh -lc '
  echo "NODE_ENV=$NODE_ENV"; \
  echo "PORT=$PORT"; \
  echo "API_PORT=$API_PORT"; \
  echo "DATABASE_URL=${DATABASE_URL:-<unset>}"; \
  echo "REDIS_URL=${REDIS_URL:-<unset>}"; \
  echo "JWT_SECRET set? $([ -n "${JWT_SECRET:-}" ] && echo yes || echo no)"; \
  echo "CLAUDE_API_KEY set? $([ -n "${CLAUDE_API_KEY:-}" ] && echo yes || echo no)";
' || true
hr

log "Network reachability from API container"
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" sh -lc '
  set -e; \
  node -e "const n=require('net');const h=process.env.PGHOST||'host.docker.internal';const p=parseInt(process.env.PGPORT||'5432',10);const s=n.createConnection({host:h,port:p},()=>{console.log(`TCP OK postgres @ ${h}:${p}`);s.end();}).on('error',e=>{console.log(`TCP FAIL postgres @ ${h}:${p} -> ${e.code||e.message}`);process.exitCode=0;});"; \
  node -e "const n=require('net');const h='host.docker.internal';const p=6379;const s=n.createConnection({host:h,port:p},()=>{console.log(`TCP OK redis @ ${h}:${p}`);s.end();}).on('error',e=>{console.log(`TCP FAIL redis @ ${h}:${p} -> ${e.code||e.message}`);process.exitCode=0;});";
' || true
hr

log "Ephemeral client DB/Redis checks (from same Docker network)"
docker run --rm --network "${NETWORK}" --add-host host.docker.internal:host-gateway postgres:15-alpine \
  sh -lc 'PGHOST=${PGHOST:-host.docker.internal}; PGUSER=${PGUSER:-postgres}; PGPASSWORD=${PGPASSWORD:-postgres}; PGDATABASE=${PGDATABASE:-urnlabs_dev}; \
  echo "psql target: $PGUSER@$PGHOST/$PGDATABASE"; \
  psql "postgresql://$PGUSER:$PGPASSWORD@$PGHOST:5432/$PGDATABASE" -c "SELECT 1;"' || true

docker run --rm --network "${NETWORK}" --add-host host.docker.internal:host-gateway redis:7-alpine \
  sh -lc 'H=host.docker.internal; echo "redis-cli to $H:6379"; redis-cli -h "$H" -p 6379 PING' || true
hr

log "Prisma client check (generate + SELECT 1)"
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" sh -lc '
  set -e; \
  pnpm exec prisma generate 1>/dev/null && echo "prisma generate: OK" || echo "prisma generate: FAILED"; \
  node -e "(async()=>{try{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();await p.$queryRaw`SELECT 1`;console.log('Prisma SELECT 1: OK');await p.$disconnect();}catch(e){console.log('Prisma SELECT 1: FAIL');console.log(e?.message||e);process.exitCode=0}})();";
' || true
hr

log "Attempt migrations (deploy) and schema presence checks"
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" sh -lc '
  pnpm exec prisma migrate deploy || true; \
  node -e "(async()=>{try{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const r=await p.$queryRawUnsafe(`SELECT to_regclass('public.users') as users, to_regclass('public.agents') as agents, to_regclass('public.workflows') as workflows`);console.log('Schema tables exist?', r);await p.$disconnect();}catch(e){console.log('Schema check error', e?.message||e)}})();";
' || true
hr

log "HTTP health endpoints from inside container"
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" sh -lc '
  for url in http://localhost:3000/health http://localhost:3000/health/ready http://localhost:3000/health/detailed; do \
    echo "GET $url"; \
    node -e "fetch(process.argv[1]).then(r=>r.text().then(t=>console.log(r.status, t))).catch(e=>console.log('fetch error:',e.message));" "$url"; \
  done;
' || true
hr

log "Done. Review the outputs above for failures and hints."

