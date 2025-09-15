#!/usr/bin/env bash
set -Eeuo pipefail

info() { echo -e "[info]  $*"; }
ok()   { echo -e "[ ok ] $*"; }
err()  { echo -e "[fail] $*" 1>&2; }

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

build_service() {
  local name=$1
  local path=$2
  local required_module=${3:-}
  local dockerfile=$ROOT_DIR/$path/Dockerfile
  [[ -f "$dockerfile" ]] || { err "Dockerfile not found for $name at $dockerfile"; return 1; }

  info "Building $name (dev target)..."
  docker build -f "$dockerfile" --target dev -t "urnlabs/$name:dev" "$ROOT_DIR"
  ok "$name dev image built"

  info "Building $name (production image)..."
  docker build -f "$dockerfile" -t "urnlabs/$name:prod" "$ROOT_DIR"
  ok "$name prod image built"

  info "Smoke testing prod image module resolution ($name)..."
  local node_cmd="require.resolve('./dist/server.js');"
  if [[ -n "$required_module" ]]; then
    node_cmd+=" require.resolve('$required_module')"
  fi
  docker run --rm --entrypoint node "urnlabs/$name:prod" -e "$node_cmd" \
    && ok "$name prod image resolves dist${required_module:+ and $required_module}" \
    || { err "$name prod image failed module resolution"; return 1; }

  info "Validating tools in dev image ($name)..."
  docker run --rm --entrypoint sh "urnlabs/$name:dev" -lc 'which pnpm && pnpm -v && (which tsx || true)' >/dev/null && ok "pnpm/tsx present"

  info "Checking workspace dependency links in dev image ($name)..."
  docker run --rm --entrypoint sh "urnlabs/$name:dev" -lc 'pnpm list --depth=0 | grep -E "@urnlabs/(ai-agents|config)" || true' >/dev/null && ok "workspace deps visible (best-effort)"
}

test_api_build()    { build_service api apps/api "@urnlabs/ai-agents"; }
test_agents_build() { build_service agents apps/agents "@urnlabs/ai-agents"; }
test_bridge_build() { build_service bridge apps/bridge; }

main() {
  local failures=0
  test_api_build || failures=$((failures+1))
  test_agents_build || failures=$((failures+1))
  test_bridge_build || failures=$((failures+1))

  if (( failures > 0 )); then
    err "$failures build(s) failed. Inspect docker build output for details."
    exit 1
  fi
  ok "All service builds completed successfully"
}

trap 'err "Build script error"' ERR
main "$@"
