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

NETWORK="$(docker compose ps -q db | xargs -r docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)"
NETWORK="${NETWORK:-salvador-connect_salvador}"

echo "==> Schema"
docker run --rm --network "$NETWORK" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}" \
  -v "$PWD":/app -w /app \
  node:20-bookworm-slim \
  bash -c 'corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --no-frozen-lockfile && cd packages/db && pnpm exec drizzle-kit push --force --config ./drizzle.config.ts' \
  || echo "WARN: schema push"

# La contraseña NO se guarda en el repo: se pide por teclado (o ADMIN_PASSWORD en el entorno).
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
if [ -z "$ADMIN_PASSWORD" ]; then
  read -r -s -p "Nueva contraseña para 'sistemas' (mín. 10 caracteres): " ADMIN_PASSWORD; echo
  read -r -s -p "Repetila: " ADMIN_PASSWORD2; echo
  if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD2" ]; then echo "Las contraseñas no coinciden."; exit 1; fi
fi
if [ "${#ADMIN_PASSWORD}" -lt 10 ]; then echo "La contraseña debe tener al menos 10 caracteres."; exit 1; fi

# Mismo formato que hashPassword() de apps/api/src/lib/auth.ts
HASH="$(docker compose exec -T -e PW="$ADMIN_PASSWORD" api node -e '
const c=require("node:crypto");const salt=c.randomBytes(16).toString("hex");
const d=c.scryptSync(process.env.PW,salt,64,{cost:16384,blockSize:8,parallelization:1});
process.stdout.write("scrypt$16384$8$1$"+salt+"$"+d.toString("hex"));')"
if [ -z "$HASH" ]; then echo "No se pudo calcular el hash (¿está levantado el contenedor api?)."; exit 1; fi

echo "==> Usuario sistemas"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
INSERT INTO users (username, name, password_hash, role, active, must_change_password)
VALUES ('sistemas', 'Sistemas', '${HASH}', 'superadmin', true, false)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = 'superadmin',
  active = true,
  must_change_password = false,
  name = 'Sistemas';

DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = 'sistemas');
DELETE FROM user_modules WHERE user_id = (SELECT id FROM users WHERE username = 'sistemas');
INSERT INTO user_modules (user_id, module_key)
SELECT u.id, m.module_key
FROM users u
CROSS JOIN (VALUES
  ('dashboard'),('administracion'),('liquidacion'),('guardias'),
  ('inventario'),('instructivos'),('configuracion'),('usuarios')
) AS m(module_key)
WHERE u.username = 'sistemas';
SQL

echo "==> Health"
curl -s http://127.0.0.1:5000/api/health; echo
echo "Listo. Ingresá con el usuario 'sistemas' y la contraseña que acabás de definir."
