#!/usr/bin/env bash
set -euo pipefail

# validate-docker-compose.sh
#
# Validates a Docker Compose file for missing services, bad dependencies,
# broken build contexts, invalid env endpoints, and basic healthcheck sanity.
#
# Usage:
#   scripts/validate-docker-compose.sh [-f compose-file] [--fix]
#
# Notes:
# - Parser is indentation-aware and focuses on the `services:` section.
# - With --fix, the script will create a timestamped backup and comment out
#   invalid depends_on entries, env lines referencing missing services, and
#   entire services with missing build contexts/Dockerfiles.

COMPOSE_FILE="docker-compose-local.yml"
DO_FIX=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file)
      COMPOSE_FILE="$2"; shift 2;;
    --fix)
      DO_FIX=1; shift;;
    *)
      echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 2
fi

timestamp() { date +%Y%m%d-%H%M%S; }

declare -A SERVICES=()
declare -A DEPENDS=()          # key: svc, value: space-separated deps
declare -A DEP_LINE=()         # key: svc->dep, value: line number
declare -A BUILD_CTX=()        # key: svc, value: context path
declare -A BUILD_CTX_LINE=()   # key: svc, value: line number
declare -A DOCKERFILE=()       # key: svc, value: dockerfile path
declare -A DOCKERFILE_LINE=()  # key: svc, value: line number
declare -A HEALTHCHECK=()      # key: svc, value: 1 if present
declare -A ENV_LINES=()        # key: svc->var, value: "line|value"
declare -A SERVICE_START=()    # key: svc, value: start line
declare -A SERVICE_END=()      # key: svc, value: end line

# Extract structure from YAML (simple indentation-based parser)
awk -v file="$COMPOSE_FILE" '
  function ltrim(s){ sub(/^\s+/, "", s); return s }
  function indent(s){ match(s, /^ */); return RLENGTH }
  BEGIN{ in_services=0; curr=""; svc_indent=-1; dep_mode=0; env_mode=0; build_mode=0; hchk_mode=0 }
  {
    line=$0; n=NR; ind=indent(line); L=ltrim(line)
    if (L ~ /^services:/ && ind==0) { in_services=1; next }
    if (!in_services) next

    # detect new top-level service under services:
    if (ind==2 && L ~ /^[a-zA-Z0-9_-]+:$/) {
      if (curr!="" && (n-1)>=last_nonempty) { svc_end[curr]=last_nonempty }
      split(L, a, ":"); curr=a[1]; svc_indent=ind; svc_start[curr]=n; dep_mode=0; env_mode=0; build_mode=0; hchk_mode=0
      services[curr]=1
      next
    }

    # track last non-empty line for end boundaries
    if (L!="") { last_nonempty=n }

    # if indentation less or equal to services root or we reach volumes/networks, close current
    if (curr!="" && (ind<=0 || L ~ /^(volumes:|networks:)/)) {
      svc_end[curr]=(n-1>=svc_start[curr]?n-1:svc_start[curr])
      curr=""; next
    }

    if (curr=="") next

    # depends_on block
    if (ind==4 && L ~ /^depends_on:/) { dep_mode=1; next }
    if (dep_mode==1) {
      if (ind>=6 && L ~ /^- /) {
        dep=substr(L,3)
        deps[curr]=(curr in deps?deps[curr]" "dep:dep)
        dep_line[curr"->"dep]=n
      } else if (ind<=4) { dep_mode=0 }
    }

    # environment block
    if (ind==4 && L ~ /^environment:/) { env_mode=1; next }
    if (env_mode==1) {
      if (ind>=6 && L ~ /^- /) {
        kv=substr(L,3)
        split(kv, p, "=")
        var=p[1]; val=substr(kv, length(var)+2)
        env_lines[curr"->"var]=n"|"val
      } else if (ind<=4) { env_mode=0 }
    }

    # build block
    if (ind==4 && L ~ /^build:/) { build_mode=1; next }
    if (build_mode==1) {
      if (ind>=6 && L ~ /^context:/) {
        path=ltrim(substr(L,9))
        build_ctx[curr]=path; build_ctx_line[curr]=n
      } else if (ind>=6 && L ~ /^dockerfile:/) {
        df=ltrim(substr(L,12))
        dockerfile[curr]=df; dockerfile_line[curr]=n
      } else if (ind<=4) { build_mode=0 }
    }

    # healthcheck presence
    if (ind==4 && L ~ /^healthcheck:/) { health[curr]=1; hchk_mode=1; next }
    if (hchk_mode==1 && ind<=4) { hchk_mode=0 }
  }
  END{
    if (curr!="") { svc_end[curr]=last_nonempty }
    for (s in services) {
      printf("SERVICE %s\n", s)
      if (s in deps) printf("DEPENDS %s %s\n", s, deps[s])
      if (s in build_ctx) printf("BUILDCTX %s %s %d\n", s, build_ctx[s], build_ctx_line[s])
      if (s in dockerfile) printf("DOCKERFILE %s %s %d\n", s, dockerfile[s], dockerfile_line[s])
      if (s in health) printf("HEALTH %s 1\n", s)
      if (s in svc_start) printf("SVCRANGE %s %d %d\n", s, svc_start[s], (s in svc_end?svc_end[s]:svc_start[s]))
    }
    for (k in env_lines) printf("ENVLINE %s %s\n", k, env_lines[k])
    for (k in dep_line) printf("DEPLINE %s %d\n", k, dep_line[k])
  }
' "$COMPOSE_FILE" | while read -r kind rest; do
  case "$kind" in
    SERVICE)
      svc="${rest}"; SERVICES["$svc"]=1 ;;
    DEPENDS)
      svc=$(echo "$rest" | awk '{print $1}'); deps=$(echo "$rest" | cut -d' ' -f2-)
      DEPENDS["$svc"]="$deps" ;;
    BUILDCTX)
      svc=$(echo "$rest" | awk '{print $1}'); path=$(echo "$rest" | awk '{print $2}'); line=$(echo "$rest" | awk '{print $3}')
      BUILD_CTX["$svc"]="$path"; BUILD_CTX_LINE["$svc"]="$line" ;;
    DOCKERFILE)
      svc=$(echo "$rest" | awk '{print $1}'); path=$(echo "$rest" | awk '{print $2}'); line=$(echo "$rest" | awk '{print $3}')
      DOCKERFILE["$svc"]="$path"; DOCKERFILE_LINE["$svc"]="$line" ;;
    HEALTH)
      svc=$(echo "$rest" | awk '{print $1}'); HEALTHCHECK["$svc"]=1 ;;
    SVCRANGE)
      svc=$(echo "$rest" | awk '{print $1}'); start=$(echo "$rest" | awk '{print $2}'); end=$(echo "$rest" | awk '{print $3}')
      SERVICE_START["$svc"]="$start"; SERVICE_END["$svc"]="$end" ;;
    ENVLINE)
      key=$(echo "$rest" | awk '{print $1}'); meta=$(echo "$rest" | cut -d' ' -f2-)
      ENV_LINES["$key"]="$meta" ;;
    DEPLINE)
      key=$(echo "$rest" | awk '{print $1}'); line=$(echo "$rest" | awk '{print $2}')
      DEP_LINE["$key"]="$line" ;;
  esac
done

errors=0
warnings=0
comment_lines=()
comment_ranges=()

have_service() { [[ -n "${SERVICES[$1]:-}" ]]; }

note_error() { echo "ERROR: $1"; errors=$((errors+1)); }
note_warn()  { echo "WARN:  $1"; warnings=$((warnings+1)); }

# Validate depends_on references
for svc in "${!DEPENDS[@]}"; do
  for dep in ${DEPENDS[$svc]}; do
    if ! have_service "$dep"; then
      note_error "Service '$svc' depends_on missing service '$dep'"
      if [[ $DO_FIX -eq 1 ]]; then
        key="$svc->$dep"; line=${DEP_LINE[$key]:-}
        if [[ -n "$line" ]]; then comment_lines+=("$line"); fi
      fi
    fi
  done
done

# Validate build contexts and dockerfiles
for svc in "${!SERVICES[@]}"; do
  ctx="${BUILD_CTX[$svc]:-}"
  if [[ -n "$ctx" ]]; then
    if [[ ! -d "$ctx" ]]; then
      note_error "Service '$svc' build.context does not exist: $ctx"
      if [[ $DO_FIX -eq 1 ]]; then
        start=${SERVICE_START[$svc]:-}; end=${SERVICE_END[$svc]:-}
        if [[ -n "$start" && -n "$end" ]]; then comment_ranges+=("$start:$end"); fi
      fi
    fi
  fi
  df="${DOCKERFILE[$svc]:-}"
  if [[ -n "$df" ]]; then
    if [[ ! -f "$df" ]]; then
      note_error "Service '$svc' dockerfile does not exist: $df"
      if [[ $DO_FIX -eq 1 ]]; then
        start=${SERVICE_START[$svc]:-}; end=${SERVICE_END[$svc]:-}
        if [[ -n "$start" && -n "$end" ]]; then comment_ranges+=("$start:$end"); fi
      fi
    fi
  fi
done

# Validate env endpoints: check for references to missing services (e.g., urn-maestro)
for key in "${!ENV_LINES[@]}"; do
  svc="${key%%->*}"; var="${key##*->}"
  IFS='|' read -r line_and_val <<< "${ENV_LINES[$key]}"
  line=${line_and_val%%|*}
  val=${line_and_val#*|}

  if [[ "$val" =~ http://([^:/]+)(:[0-9]+)?(/.*)? ]]; then
    host="${BASH_REMATCH[1]}"
    # only validate if host looks like a service name
    if [[ "$host" != "localhost" && "$host" != "127.0.0.1" ]]; then
      if ! have_service "$host"; then
        note_warn "ENV $svc:$var points to missing service host '$host'"
        if [[ $DO_FIX -eq 1 ]]; then comment_lines+=("$line"); fi
      fi
    fi
  fi

  # Explicitly catch legacy MAESTRO_ENDPOINT references
  if [[ "$var" == *MAESTRO_ENDPOINT* ]]; then
    if [[ $DO_FIX -eq 1 ]]; then comment_lines+=("$line"); fi
  fi
done

# Healthcheck presence check
for svc in "${!SERVICES[@]}"; do
  if [[ -z "${HEALTHCHECK[$svc]:-}" ]]; then
    note_warn "Service '$svc' has no healthcheck configured"
  fi
done

# Detect cycles in depends_on (best-effort)
declare -A temp_mark=()
declare -A perm_mark=()
cycle_found=0
stack=( )

dfs() {
  local n="$1"
  if [[ -n "${perm_mark[$n]:-}" ]]; then return 0; fi
  if [[ -n "${temp_mark[$n]:-}" ]]; then
    echo "ERROR: Dependency cycle detected involving: ${stack[*]} -> $n"
    cycle_found=1; return 1
  fi
  temp_mark[$n]=1
  stack+=("$n")
  for m in ${DEPENDS[$n]:-}; do
    dfs "$m" || true
  done
  unset temp_mark[$n]
  perm_mark[$n]=1
  unset 'stack[${#stack[@]}-1]'
}

for svc in "${!SERVICES[@]}"; do dfs "$svc"; done
if [[ $cycle_found -eq 1 ]]; then errors=$((errors+1)); fi

if [[ $DO_FIX -eq 1 ]]; then
  if (( ${#comment_lines[@]} > 0 || ${#comment_ranges[@]} > 0 )); then
    backup="$COMPOSE_FILE.bak.$(timestamp)"
    cp "$COMPOSE_FILE" "$backup"
    echo "Backup created: $backup"

    # Build a sed script to comment out target lines and ranges
    sed_script=$(mktemp)
    for lr in "${comment_ranges[@]}"; do
      start=${lr%%:*}; end=${lr##*:}
      echo "$start,$end s/^/# /" >> "$sed_script"
    done
    for ln in "${comment_lines[@]}"; do
      echo "$ln s/^/# /" >> "$sed_script"
    done
    sed -f "$sed_script" "$backup" > "$COMPOSE_FILE"
    rm -f "$sed_script"
    echo "Applied automatic fixes to $COMPOSE_FILE"
  else
    echo "No automatic fixes required."
  fi
fi

echo
echo "Validation summary: $errors error(s), $warnings warning(s)"
if [[ $errors -gt 0 ]]; then exit 3; fi
exit 0

