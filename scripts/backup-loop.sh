#!/bin/sh
# Backup diario de PostgreSQL (corre dentro del servicio "backup" de docker-compose).
#   sh backup-loop.sh          → queda corriendo: un backup por día a partir de BACKUP_HOUR
#   sh backup-loop.sh --once   → hace un backup ahora y termina
# Formato: pg_dump custom (-Fc, comprimido). Se restaura con scripts/restore-backup.sh.
set -eu

DIR="${BACKUP_PATH:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
LOCK="$DIR/.backup.lock"
mkdir -p "$DIR"

# Candado: nunca dos backups a la vez (el diario y uno manual pueden coincidir).
# mkdir es atómico; si el candado quedó de un proceso que murió hace más de 2 horas, se descarta.
tomar_candado() {
  intentos=0
  while ! mkdir "$LOCK" 2>/dev/null; do
    if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
      rm -rf "$LOCK"
      continue
    fi
    intentos=$((intentos + 1))
    if [ "$intentos" -eq 1 ]; then echo "$(date '+%F %T') hay otro backup en curso, esperando..."; fi
    if [ "$intentos" -ge 180 ]; then echo "$(date '+%F %T') ERROR: el otro backup no terminó en 30 minutos" >&2; return 1; fi
    sleep 10
  done
}
soltar_candado() { rm -rf "$LOCK"; }

hacer_backup() {
  tomar_candado || return 1
  stamp="$(date +%Y-%m-%d_%H%M%S)"
  tmp="$DIR/.sanatorio_${stamp}_$$.dump.tmp"   # nombre único por proceso
  final="$DIR/sanatorio_${stamp}.dump"
  estado=0
  if pg_dump -Fc -Z 6 -f "$tmp" && pg_restore -l "$tmp" >/dev/null; then
    # pg_restore -l lee el índice completo: si el archivo quedó cortado, falla y no se guarda.
    mv "$tmp" "$final"
    echo "$(date '+%F %T') backup OK: $(basename "$final") ($(du -h "$final" | cut -f1))"
    # Retención: borrar backups más viejos que KEEP_DAYS días.
    find "$DIR" -name 'sanatorio_*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/borrado por antigüedad: /'
  else
    rm -f "$tmp"
    echo "$(date '+%F %T') ERROR: falló el backup (no se guardó nada)" >&2
    estado=1
  fi
  # Restos de intentos anteriores interrumpidos.
  find "$DIR" -name '.sanatorio_*.dump.tmp' -type f -mmin +120 -delete 2>/dev/null || true
  soltar_candado
  return $estado
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
