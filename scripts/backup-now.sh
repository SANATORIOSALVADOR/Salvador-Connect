#!/usr/bin/env bash
# Hace un backup de la base ahora (además del diario automático).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d backup >/dev/null
docker compose exec -T backup sh /backup-loop.sh --once
echo "Backups disponibles:"
ls -lh "${BACKUP_DIR:-./backups}" | tail -n +2
