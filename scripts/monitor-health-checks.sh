#!/usr/bin/env bash
set -Eeuo pipefail

API_URL=${API_URL:-http://localhost:3000/health}
AGENTS_URL=${AGENTS_URL:-http://localhost:3001/health}
BRIDGE_URL=${BRIDGE_URL:-http://localhost:3004/health}
INTERVAL=${INTERVAL:-5}

status() {
  local name=$1 url=$2
  local code time_ms
  time_ms=$( (time -p curl -fsS -o /dev/null -w '%{http_code}' "$url") 2>&1 | awk '/real/ {print $2*1000}') || true
  code=$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || echo 000)
  if [[ "$code" == "200" ]]; then
    printf "[ ok ] %-7s %3s %6sms\n" "$name" "$code" "${time_ms:-?}"
  else
    printf "[fail] %-7s %3s %6sms\n" "$name" "$code" "${time_ms:-?}"
  fi
}

trap 'echo; echo "Stopping health monitor"' INT TERM
echo "Monitoring health endpoints every ${INTERVAL}s (Ctrl+C to stop)"
while true; do
  status API "$API_URL"
  status AGENTS "$AGENTS_URL"
  status BRIDGE "$BRIDGE_URL"
  sleep "$INTERVAL"
done

