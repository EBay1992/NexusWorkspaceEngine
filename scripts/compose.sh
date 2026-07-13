#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RELAY_OFF=false
ARGS=()

usage() {
  cat <<'EOF'
Orbit Docker Compose wrapper.

Usage:
  pnpm docker up -d              # full stack (includes relay)
  pnpm docker --relay-off up -d  # stack without relay (postgres redis gateway web)
  pnpm docker:relay              # start relay after --relay-off up
  pnpm docker ps
  pnpm docker down

The --relay-off flag can appear anywhere before the compose subcommand args.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --relay-off)
      RELAY_OFF=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#ARGS[@]} -eq 0 ]]; then
  usage
  exit 1
fi

COMPOSE=(docker compose)
if [[ "$RELAY_OFF" == true ]]; then
  COMPOSE+=(-f docker-compose.yml -f docker-compose.relay-off.yml)
  echo "==> Relay disabled (postgres, redis, gateway, web only)"
fi

exec "${COMPOSE[@]}" "${ARGS[@]}"
