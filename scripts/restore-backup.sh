#!/usr/bin/env bash
# Restaura la base desde un backup de ./backups. REEMPLAZA los datos actuales.
#   bash scripts/restore-backup.sh                      → lista los backups
#   bash scripts/restore-backup.sh sanatorio_2026-10-14_0300.dump
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${BACKUP_DIR:-./backups}"

if [ -z "${1:-}" ]; then
  echo "Backups disponibles (más nuevos al final):"
  ls -1 "$DIR"/sanatorio_*.dump 2>/dev/null | xargs -r -n1 basename || echo "  (ninguno)"
  echo "Uso: bash scripts/restore-backup.sh <archivo>"
  exit 0
fi
ARCHIVO="$(basename "$1")"
[ -f "$DIR/$ARCHIVO" ] || { echo "No existe $DIR/$ARCHIVO"; exit 1; }

echo "ATENCIÓN: se van a REEMPLAZAR todos los datos actuales por los de $ARCHIVO."
echo "Antes se hace un backup de seguridad del estado actual."
read -r -p "Escribí RESTAURAR para continuar: " OK
[ "$OK" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

docker compose up -d backup >/dev/null
docker compose exec -T backup sh /backup-loop.sh --once
docker compose stop api
docker compose exec -T -e ARCHIVO="$ARCHIVO" backup sh -c 'pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "/backups/$ARCHIVO"'
docker compose start api
echo "Restaurado desde $ARCHIVO. La API se reinició."
