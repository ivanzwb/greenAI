#!/usr/bin/env bash
# Deploy greenAI API stack (Docker Compose). Run from repository root.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${API_PUBLISH_PORT:=3000}"

COMPOSE_FILE="deploy/docker-compose.prod.yml"

if [[ ! -f ".env" ]]; then
  echo "Missing .env in repo root. Copy .env.example to .env and fill secrets." >&2
  exit 1
fi

echo "==> Building and starting stack (${COMPOSE_FILE})"
docker compose -f "$COMPOSE_FILE" --env-file .env up -d --build

echo "==> Waiting for API health (localhost:${API_PUBLISH_PORT})"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PUBLISH_PORT}/health" >/dev/null 2>&1; then
    echo "OK: /health"
    exit 0
  fi
  sleep 1
done
echo "WARN: /health did not become ready in time; check: docker compose -f $COMPOSE_FILE logs -f api" >&2
exit 1
