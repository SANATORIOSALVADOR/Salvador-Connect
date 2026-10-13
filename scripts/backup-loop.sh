#!/bin/sh
# Backup diario de PostgreSQL (corre dentro del servicio "backup" de docker-compose).
#   sh backup-loop.sh          → queda corriendo: un backup por día a partir de BACKUP_HOUR
#   sh backup-loop.sh --once   → hace un backup ahora y termina
# Formato: pg_dump custom (-Fc, comprimido). Se restaura con scripts/restore-backup.sh.
set -eu

DIR="${BACKUP_PATH:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
mkdir -p "$DIR"

hacer_backup() {
  stamp="$(date +%Y-%m-%d_%H%M)"
  tmp="$DIR/.sanatorio_$stamp.dump.tmp"
  final="$DIR/sanatorio_$stamp.dump"
  if pg_dump -Fc -Z 6 -f "$tmp"; then
    mv "$tmp" "$final"
    echo "$(date '+%F %T') backup OK: $(basename "$final") ($(du -h "$final" | cut -f1))"
  else
    rm -f "$tmp"
    echo "$(date '+%F %T') ERROR: falló pg_dump" >&2
    return 1
  fi
  # Retención: borrar backups más viejos que KEEP_DAYS días.
  find "$DIR" -name 'sanatorio_*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/borrado por antigüedad: /'
}

if [ "${1:-}" = "--once" ]; then
  hacer_backup
  exit $?
fi

echo "Backups diarios desde las ${HOUR}:00 en $DIR (se guardan $KEEP_DAYS días)."
while true; do
  hoy="$(date +%Y-%m-%d)"
  hora="$(date +%H | sed 's/^0//')"
  if [ "${hora:-0}" -ge "$HOUR" ] && ! ls "$DIR"/sanatorio_"$hoy"_*.dump >/dev/null 2>&1; then
    hacer_backup || true
  fi
  sleep 600
done
