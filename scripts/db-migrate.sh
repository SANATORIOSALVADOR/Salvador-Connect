#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-sanatorio}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}"
POSTGRES_DB="${POSTGRES_DB:-sanatorio_db}"

echo "Esperando Postgres..."
for i in $(seq 1 40); do
  if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

NETWORK="$(docker compose ps -q db | xargs -r docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)"
NETWORK="${NETWORK:-salvador-connect_salvador}"

echo "Aplicando schema (drizzle-kit push --force) en red $NETWORK..."
docker run --rm --network "$NETWORK" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}" \
  -v "$PWD":/app -w /app \
  node:20-bookworm-slim \
  bash -c 'corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --no-frozen-lockfile && pnpm --filter @salvador/db exec drizzle-kit push --force --config ./drizzle.config.ts'

echo "Schema OK. Reiniciando API..."
docker compose restart api
sleep 3
curl -s http://127.0.0.1:5000/api/health || true
echo ""
