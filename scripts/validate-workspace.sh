#!/usr/bin/env bash
set -Eeuo pipefail

info() { echo -e "[info]  $*"; }
ok()   { echo -e "[ ok ] $*"; }
err()  { echo -e "[fail] $*" 1>&2; }

check_file() {
  local f=$1; [[ -f "$f" ]] || { err "Missing file: $f"; return 1; }; ok "Found $f"
}

check_workspace_patterns() {
  info "Validating pnpm-workspace.yaml patterns..."
  grep -q "apps/*" pnpm-workspace.yaml && grep -q "packages/*" pnpm-workspace.yaml \
    && ok "pnpm-workspace.yaml includes apps/* and packages/*" \
    || err "pnpm-workspace.yaml missing expected patterns"
}

check_root_workspaces() {
  info "Validating root package.json workspaces..."
  grep -q '"apps/*"' package.json && grep -q '"packages/*"' package.json \
    && ok "package.json workspaces aligned" \
    || err "package.json workspaces not aligned with pnpm-workspace.yaml"
}

root_install() {
  info "Installing root dependencies with pnpm..."
  corepack enable pnpm || true
  pnpm install --frozen-lockfile
  ok "pnpm install completed"
}

check_tools() {
  info "Checking tool availability (tsx, tsc-alias)..."
  [[ -x node_modules/.bin/tsx ]] && ok "tsx available" || err "tsx missing in root node_modules/.bin"
  [[ -x node_modules/.bin/tsc-alias ]] && ok "tsc-alias available" || err "tsc-alias missing in root node_modules/.bin"
}

build_packages() {
  info "Building all workspace packages..."
  pnpm -r --filter "./packages/**" build
  ok "Workspace packages built"
}

main() {
  check_file pnpm-workspace.yaml || true
  check_file package.json || true
  check_workspace_patterns || true
  check_root_workspaces || true
  root_install || true
  check_tools || true
  build_packages || true
  ok "Workspace validation completed (see any warnings above)."
}

trap 'err "Validation script error"' ERR
main "$@"

