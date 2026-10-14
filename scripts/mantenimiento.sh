#!/usr/bin/env bash
# Modo mantenimiento: todas las PCs ven la pantalla «Estamos haciendo mantenimiento» y vuelven solas al terminar.
#
#   bash scripts/mantenimiento.sh on                                  → prende (sin mensaje)
#   bash scripts/mantenimiento.sh on "Actualizamos el sistema" 30     → con aviso y vuelta estimada en 30 minutos
#   bash scripts/mantenimiento.sh on "Corte de luz programado" 18:30  → vuelta estimada hoy a las 18:30
#   bash scripts/mantenimiento.sh off                                 → apaga
#   bash scripts/mantenimiento.sh estado                              → muestra si está prendido
#
# Funciona creando / borrando estado/mantenimiento.json (el nginx de la web lo lee al instante: no hay que reiniciar nada).
# Mientras está prendido, el sistema no deja guardar cambios (la API devuelve «en mantenimiento»).
set -euo pipefail
cd "$(dirname "$0")/.."
ARCHIVO="estado/mantenimiento.json"
mkdir -p estado

json_texto() { # escapa para JSON
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n'
}

case "${1:-estado}" in
  on|prender|si)
    MENSAJE="${2:-}"
    HASTA=""
    if [ -n "${3:-}" ]; then
      if [[ "$3" =~ ^[0-9]+$ ]]; then
        HASTA="$(date -d "+$3 minutes" '+%Y-%m-%dT%H:%M:%S%:z')"
      elif [[ "$3" =~ ^[0-9]{1,2}:[0-9]{2}$ ]]; then
        HASTA="$(date -d "today $3" '+%Y-%m-%dT%H:%M:%S%:z')"
      else
        echo "No entiendo «$3»: usá minutos (30) o una hora (18:30)." >&2
        exit 1
      fi
    fi
    TMP="$(mktemp estado/.mant.XXXXXX)"
    printf '{"mensaje":"%s","hasta":"%s","desde":"%s"}\n' "$(json_texto "$MENSAJE")" "$HASTA" "$(date '+%Y-%m-%dT%H:%M:%S%:z')" > "$TMP"
    chmod 644 "$TMP"
    mv "$TMP" "$ARCHIVO"
    echo "== Mantenimiento PRENDIDO"
    [ -n "$MENSAJE" ] && echo "   Aviso: $MENSAJE"
    [ -n "$HASTA" ] && echo "   Vuelta estimada: $(date -d "$HASTA" '+%d/%m %H:%M')"
    echo "   Para apagarlo: bash scripts/mantenimiento.sh off"
    ;;
  off|apagar|no)
    rm -f "$ARCHIVO"
    echo "== Mantenimiento APAGADO: las pantallas vuelven solas al sistema en unos segundos."
    ;;
  estado|status)
    if [ -f "$ARCHIVO" ]; then echo "Mantenimiento: PRENDIDO"; cat "$ARCHIVO"; else echo "Mantenimiento: apagado"; fi
    ;;
  *)
    echo "Uso: bash scripts/mantenimiento.sh on [\"mensaje\"] [minutos|HH:MM] | off | estado" >&2
    exit 1
    ;;
esac
