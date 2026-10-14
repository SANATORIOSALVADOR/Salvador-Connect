#!/usr/bin/env bash
# Deja el sistema accesible por nombre dentro de la red (sin IP ni puerto):
#   http://sanatorio.salvador.connect
#
# Uso (en la carpeta del proyecto, en el servidor):
#   bash scripts/configurar-nombre.sh                     → nombre por defecto, IP detectada
#   bash scripts/configurar-nombre.sh otro.nombre         → otro nombre
#   SERVER_IP=172.20.1.134 bash scripts/configurar-nombre.sh   → forzar la IP
#   bash scripts/configurar-nombre.sh --sin-dns           → solo puerto 80 (el nombre lo carga el router)
#
# Qué hace: pasa la web al puerto 80, guarda SITE_NAME / SERVER_IP en .env y levanta el DNS interno
# (servicio "dns" de docker-compose). Después hay que indicarle a la red que use este servidor como DNS
# (ver docs/NOMBRE_LOCAL.md). No toca la base de datos.
set -euo pipefail
cd "$(dirname "$0")/.."

SIN_DNS=0
NOMBRE="sanatorio.salvador.connect"
for a in "$@"; do
  case "$a" in
    --sin-dns) SIN_DNS=1 ;;
    -*) echo "Opción desconocida: $a" >&2; exit 1 ;;
    *) NOMBRE="$a" ;;
  esac
done
if ! [[ "$NOMBRE" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then
  echo "Nombre inválido: $NOMBRE (solo minúsculas, números, guiones y puntos)" >&2
  exit 1
fi

[ -f .env ] || { echo "No existe .env (copiá .env.example y completalo primero)." >&2; exit 1; }

# IP del servidor en la red: la que usa para salir (se puede forzar con SERVER_IP=...).
IP="${SERVER_IP:-}"
if [ -z "$IP" ]; then
  IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
fi
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "No pude detectar la IP. Usá: SERVER_IP=x.x.x.x bash $0" >&2; exit 1; }

set_env() { # clave valor
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}
en_uso() { # puerto proto(t|u) → ¿alguien escucha?
  ss -"$2"lnH "sport = :$1" 2>/dev/null | grep -q .
}

echo "== Nombre: $NOMBRE"
echo "== IP del servidor: $IP"
cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"

# 1) Web en el puerto 80 (para no escribir :8080).
ACTUAL="$(grep -E '^WEB_BIND=' .env | cut -d= -f2- || true)"
PUERTO_WEB=80
if [[ "$ACTUAL" == *":80" ]]; then
  echo "== La web ya está en el puerto 80"
elif en_uso 80 t; then
  PUERTO_WEB="${ACTUAL##*:}"
  echo "!! El puerto 80 lo usa otro programa: la web sigue en ${ACTUAL:-0.0.0.0:8080}"
  echo "   (la dirección va a ser http://$NOMBRE:$PUERTO_WEB). Mirá qué es con: sudo ss -ltnp 'sport = :80'"
else
  set_env WEB_BIND "0.0.0.0:80"
  echo "== Web pasada al puerto 80 (antes: ${ACTUAL:-0.0.0.0:8080})"
fi

set_env SITE_NAME "$NOMBRE"
set_env SERVER_IP "$IP"

# 2) DNS interno.
if [ "$SIN_DNS" = 1 ]; then
  sed -i '/^COMPOSE_PROFILES=/d' .env
  echo "== DNS interno desactivado (--sin-dns): cargá el nombre en el router"
elif ss -ulnH 2>/dev/null | awk '{print $4}' | grep -Eq "^($IP|0\.0\.0\.0|\*|\[::\]):53$" && ! docker compose ps --status running dns 2>/dev/null | grep -q dns; then
  echo "!! El puerto 53 (DNS) ya lo usa otro programa en $IP: no se levanta el DNS interno."
  echo "   Mirá qué es con: sudo ss -ulnp 'sport = :53'   (o usá --sin-dns y cargá el nombre en el router)"
  SIN_DNS=1
else
  set_env COMPOSE_PROFILES "dns"
fi

echo "== Aplicando cambios"
docker compose up -d --force-recreate web
if [ "$SIN_DNS" = 0 ]; then
  docker compose up -d --build --force-recreate dns
fi

# La web ofrece el instalador del acceso con esta dirección (si el nginx del servidor ya da la dirección
# sin puerto —scripts/configurar-nginx-host.sh— se respeta).
URL_SITIO="http://$NOMBRE"; [ "$PUERTO_WEB" != 80 ] && URL_SITIO="$URL_SITIO:$PUERTO_WEB"
[ "$(grep -E '^SITE_URL=' .env | cut -d= -f2- || true)" = "http://$NOMBRE" ] || set_env SITE_URL "$URL_SITIO"
docker compose up -d --force-recreate api >/dev/null

# 3) Pruebas.
sleep 3
echo
echo "== Pruebas"
URL="http://$NOMBRE"; [ "$PUERTO_WEB" != 80 ] && URL="$URL:$PUERTO_WEB"
codigo="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $NOMBRE" "http://$IP:$PUERTO_WEB/" || true)"
[ "$codigo" = 200 ] && echo "OK   la web responde en $IP:$PUERTO_WEB" || echo "FALLA la web respondió '$codigo' en $IP:$PUERTO_WEB (mirá: docker compose logs web --tail 30)"
if [ "$SIN_DNS" = 0 ]; then
  r="$(docker compose exec -T dns nslookup "$NOMBRE" 127.0.0.1 2>/dev/null | awk '/^Address/ {a = $NF} END {print a}')"
  [ "$r" = "$IP" ] && echo "OK   el DNS interno responde $NOMBRE → $IP" || echo "FALLA el DNS interno no respondió (mirá: docker compose logs dns --tail 30)"
  r="$(docker compose exec -T dns nslookup google.com 127.0.0.1 2>/dev/null | grep -c '^Address' || true)"
  [ "${r:-0}" -ge 2 ] && echo "OK   el DNS interno resuelve internet (google.com)" || echo "FALLA el DNS interno no resuelve internet (¿el servidor tiene salida a internet?)"
fi
if command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "!! El firewall (ufw) está activo: habilitá los puertos con"
  echo "   sudo ufw allow $PUERTO_WEB/tcp && sudo ufw allow 53"
fi

echo
echo "Listo. Dirección del sistema: $URL"
if [ "$SIN_DNS" = 0 ]; then
  echo "Falta un paso en la red: que las PCs usen $IP como DNS. Lo más simple es en el router,"
  echo "en DHCP → DNS primario: $IP (secundario: 8.8.8.8). Las PCs lo toman al reiniciar o con: ipconfig /renew"
  echo "Para probar en una PC sin tocar el router: nslookup $NOMBRE $IP"
else
  echo "Falta cargar en el DNS del router o del servidor Windows: $NOMBRE  (tipo A) → $IP"
fi
echo "Más detalle: docs/NOMBRE_LOCAL.md"
