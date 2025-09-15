#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose-nodejs.yml}
TIMEOUT=${TIMEOUT:-180}

info() { echo -e "[info]  $*"; }
ok()   { echo -e "[ ok ] $*"; }
err()  { echo -e "[fail] $*" 1>&2; }

require_tools() {
  command -v docker >/dev/null || { err "docker not found"; exit 1; }
  command -v docker compose >/dev/null || info "Using legacy docker-compose if installed"
}

wait_healthy() {
  local svc=$1; local waited=0
  info "Waiting for $svc to become healthy (timeout ${TIMEOUT}s)..."
  while true; do
    local cid status
    cid=$(docker compose -f "$COMPOSE_FILE" ps -q "$svc" 2>/dev/null | head -n1)
    status=$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "unknown")
    if [[ "$status" == "healthy" ]]; then ok "$svc healthy"; break; fi
    if (( waited >= TIMEOUT )); then err "$svc did not become healthy in time"; return 1; fi
    sleep 3; waited=$((waited+3))
  done
}

precheck_dependencies() {
  info "Validating external dependencies on host.docker.internal:5432/6379..."
  if command -v nc >/dev/null 2>&1; then
    nc -z host.docker.internal 5432 && ok "Postgres reachable" || { err "Postgres not reachable"; }
    nc -z host.docker.internal 6379 && ok "Redis reachable" || { err "Redis not reachable"; }
  else
    info "nc not available; skipping direct TCP checks"
  fi
  if [[ -f scripts/test-connections.sh ]]; then
    bash scripts/test-connections.sh || err "Connection tests reported issues"
  fi
}

start_service() {
  local svc=$1
  info "Starting $svc..."
  docker compose -f "$COMPOSE_FILE" up -d "$svc"
  wait_healthy "$svc"
}

show_logs_on_failure() {
  local svc=$1
  err "Recent logs for $svc:"; docker compose -f "$COMPOSE_FILE" logs --tail=100 "$svc" || true
}

main() {
  require_tools
  precheck_dependencies || true

  # Start API, then Agents, then Bridge with health gating
start_service api || { show_logs_on_failure api; exit 1; }
start_service agents || { show_logs_on_failure agents; exit 1; }
start_service bridge || { show_logs_on_failure bridge; exit 1; }

  ok "All services are healthy. Stack is ready."
}

trap 'err "Startup test encountered an error"' ERR
main "$@"
