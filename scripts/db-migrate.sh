#!/usr/bin/env bash
# Las migraciones (packages/db/migrations) las aplica la API sola al arrancar.
# Este script solo reinicia la API y muestra qué aplicó.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose restart api
echo "Esperando la API..."
for i in $(seq 1 40); do
  if curl -fs http://127.0.0.1:5000/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done
docker compose logs --since 3m api | grep -E "Migración aplicada|Base de datos|migraciones" || true
