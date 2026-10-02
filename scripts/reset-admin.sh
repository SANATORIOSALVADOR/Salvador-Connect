#!/usr/bin/env bash
# Crea/actualiza usuario sistemas / salvador2026 y aplica schema si hace falta
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

NETWORK="$(docker compose ps -q db | xargs -r docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)"
NETWORK="${NETWORK:-salvador-connect_salvador}"

echo "==> Schema (drizzle push --force)"
docker run --rm --network "$NETWORK" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}" \
  -v "$PWD":/app -w /app \
  node:20-bookworm-slim \
  bash -c 'corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --no-frozen-lockfile && cd packages/db && pnpm exec drizzle-kit push --force --config ./drizzle.config.ts' \
  || echo "WARN: push schema falló (puede que ya exista)"

HASH='scrypt$16384$8$1$1db4f90a649ef92fa47361a1faceed29$613b3dc5db7d9f16c43e88ab446a62850d860e4d7979a3840ea914f6207a2975437f260562c123b18c744b14e35921cba6629cd014e7d7436371fe82cafd4de6'

echo "==> Usuario sistemas / salvador2026"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
INSERT INTO users (username, name, password_hash, role, active, must_change_password)
VALUES ('sistemas', 'Sistemas', '${HASH}', 'superadmin', true, false)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = 'superadmin',
  active = true,
  must_change_password = false,
  name = 'Sistemas';

INSERT INTO user_modules (user_id, module_key)
SELECT u.id, m.module_key
FROM users u
CROSS JOIN (VALUES
  ('dashboard'),('administracion'),('liquidacion'),('guardias'),
  ('inventario'),('instructivos'),('configuracion'),('usuarios')
) AS m(module_key)
WHERE u.username = 'sistemas'
ON CONFLICT DO NOTHING;
SQL

echo "==> Restart API"
docker compose restart api
sleep 3
echo "==> Health"
curl -s http://127.0.0.1:5000/api/health || true
echo ""
echo "==> Test login"
curl -s -X POST http://127.0.0.1:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"sistemas","password":"salvador2026"}' | head -c 400
echo ""
