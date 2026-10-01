#!/usr/bin/env bash
# Detiene y elimina contenedores del stack (NO borra el repo ni el volumen DB por defecto).
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR:-$HOME/salvador-connect}"
cd "$INSTALL_DIR"

echo "Deteniendo stack..."
docker compose down --remove-orphans

if [ "${1:-}" = "--purge" ]; then
  echo "PURGE: eliminando volúmenes (borra la base de datos)"
  docker compose down -v --remove-orphans
  rm -f .env.deploy docker-compose.override.yml
fi

echo "Listo."
