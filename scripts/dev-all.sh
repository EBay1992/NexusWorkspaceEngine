#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export JWT_SIGNING_KEY="${JWT_SIGNING_KEY:-dev-signing-key-32-bytes-minimum!!}"
export DATABASE_URL="${DATABASE_URL:-postgresql://orbit:orbit@localhost:5432/orbit}"
export RELAY_PORT="${RELAY_PORT:-1234}"
export RELAY_DEV_NO_AUTH="${RELAY_DEV_NO_AUTH:-true}"
export NEXT_PUBLIC_GATEWAY_URL="${NEXT_PUBLIC_GATEWAY_URL:-http://localhost:5080}"
export NEXT_PUBLIC_RELAY_WS_URL="${NEXT_PUBLIC_RELAY_WS_URL:-ws://localhost:1234/orbit}"
export ASPNETCORE_URLS="${ASPNETCORE_URLS:-http://0.0.0.0:5080}"

echo "==> Stopping existing Orbit dev processes..."
for port in 3000 1234 5080; do
  lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
done
pkill -f "@orbit/relay dev" 2>/dev/null || true
pkill -f "@orbit/web dev" 2>/dev/null || true
pkill -f "Orbit.Gateway.dll" 2>/dev/null || true
sleep 1

echo "==> Starting Postgres + Redis..."
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop, then retry."
  echo "       Or use the full Docker stack: docker compose up -d"
  exit 1
fi

# Remove stale containers/networks from prior partial starts (avoids "network not found").
docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up -d postgres redis

echo "==> Waiting for Postgres..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U orbit -d orbit >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Applying gateway schema..."
docker compose exec -T postgres psql -U orbit -d orbit < services/gateway/Sql/schema.sql >/dev/null 2>&1 || true

echo "==> Starting gateway (http://localhost:5080)..."
(
  cd services/gateway
  dotnet run --no-launch-profile
) &> /tmp/orbit-gateway.log &
GATEWAY_PID=$!

echo "==> Starting relay (ws://localhost:${RELAY_PORT}/orbit)..."
(
  RELAY_PORT="$RELAY_PORT" RELAY_DEV_NO_AUTH="$RELAY_DEV_NO_AUTH" JWT_SIGNING_KEY="$JWT_SIGNING_KEY" \
    pnpm --filter @orbit/relay dev
) &> /tmp/orbit-relay.log &
RELAY_PID=$!

echo "==> Starting web (http://localhost:3000)..."
(
  NEXT_PUBLIC_GATEWAY_URL="$NEXT_PUBLIC_GATEWAY_URL" NEXT_PUBLIC_RELAY_WS_URL="$NEXT_PUBLIC_RELAY_WS_URL" \
    pnpm --filter @orbit/web dev
) &> /tmp/orbit-web.log &
WEB_PID=$!

cleanup() {
  echo ""
  echo "==> Shutting down Orbit dev stack..."
  kill "$WEB_PID" "$RELAY_PID" "$GATEWAY_PID" 2>/dev/null || true
  wait "$WEB_PID" "$RELAY_PID" "$GATEWAY_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Orbit dev stack running:"
echo "  Web:     http://localhost:3000/workspace/demo"
echo "  Gateway: http://localhost:5080/health"
echo "  Relay:   http://localhost:${RELAY_PORT}/health"
echo ""
echo "Logs: /tmp/orbit-{web,relay,gateway}.log"
echo "Press Ctrl+C to stop all services."
echo ""

wait
