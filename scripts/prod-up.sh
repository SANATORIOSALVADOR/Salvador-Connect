#!/usr/bin/env bash
# Levantamiento producción/staging en un server Linux con Docker.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Salvador-Connect — prod-up ==="

if [ ! -f .env ]; then
  echo "No hay .env — creando desde .env.example con password aleatorio"
  cp .env.example .env
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  sed -i "s/CAMBIAR_PASSWORD_FUERTE/${DB_PASS}/" .env
  # Server de prueba por defecto
  if grep -q 'WEB_BIND=0.0.0.0:8080' .env; then
    sed -i 's|WEB_BIND=0.0.0.0:8080|WEB_BIND=0.0.0.0:8085|' .env
  fi
  chmod 600 .env
  echo "Creado .env (chmod 600). Revisá WEB_BIND si hace falta."
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# Recuperar frontend Replit si hace falta (antes del build)
if [ ! -f apps/web/src/components/ui/button.tsx ] && [ -d artifacts/sanatorio-salvador/src ]; then
  echo "Restaurando frontend desde artifacts..."
  bash scripts/restore-frontend.sh || true
elif [ ! -f apps/web/src/components/ui/button.tsx ]; then
  echo "Recuperando artifacts desde origin..."
  git fetch origin 2>/dev/null || true
  git checkout origin/main -- artifacts/sanatorio-salvador 2>/dev/null || true
  if [ -d artifacts/sanatorio-salvador/src ]; then
    bash scripts/restore-frontend.sh || true
  fi
fi

echo "Build + up..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

echo "Migraciones..."
bash scripts/db-migrate.sh

echo ""
echo "=== Estado ==="
docker compose ps
echo ""
echo "Web:  http://$(hostname -I | awk '{print $1}'):${WEB_BIND##*:}"
echo "     o según WEB_BIND en .env"
echo "Health interno: curl -s http://127.0.0.1:5000/api/health"
echo "Login bootstrap: sistemas (cambiar password al entrar)"
echo ""
echo "Listo para pruebas. Luego: Claude Code + Proxmox."
