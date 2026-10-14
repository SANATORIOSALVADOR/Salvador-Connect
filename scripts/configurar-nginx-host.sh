#!/usr/bin/env bash
# Usa el nginx que ya está instalado en el servidor (puerto 80) para que el sistema se abra SIN puerto:
#   http://sanatorio.salvador.connect   →   web del sistema (WEB_BIND, ej. 172.20.1.134:8085)
#
# Solo agrega un sitio nuevo para ese nombre: lo que el nginx ya sirve (otros nombres / la IP) no cambia.
# Uso (en la carpeta del proyecto):  bash scripts/configurar-nginx-host.sh   (pide la clave de sudo)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "No existe .env" >&2; exit 1; }

leer() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }

NOMBRE="$(leer SITE_NAME)"; NOMBRE="${NOMBRE:-sanatorio.salvador.connect}"
BIND="$(leer WEB_BIND)"; BIND="${BIND:-0.0.0.0:8080}"
HOST="${BIND%:*}"; PUERTO="${BIND##*:}"
[ "$HOST" = "0.0.0.0" ] || [ -z "$HOST" ] && HOST="127.0.0.1"
DESTINO="http://$HOST:$PUERTO"

command -v nginx >/dev/null || { echo "No hay nginx instalado en el servidor." >&2; exit 1; }
if [ -d /etc/nginx/sites-available ]; then
  CONF=/etc/nginx/sites-available/salvador-connect.conf
  LINK=/etc/nginx/sites-enabled/salvador-connect.conf
else
  CONF=/etc/nginx/conf.d/salvador-connect.conf
  LINK=""
fi

# Pantalla «sistema no disponible» propia de este nginx: se muestra si el contenedor de la web está caído
# (por ejemplo, mientras se reconstruye). Las de mantenimiento las da el nginx de la web.
PAGINAS=/var/www/salvador-connect-estado
sudo mkdir -p "$PAGINAS"
sudo cp apps/web/public/estado/caido.html "$PAGINAS/__sc_caido.html"
sudo chmod -R a+rX "$PAGINAS"

echo "== $NOMBRE → $DESTINO (archivo: $CONF)"
TMP="$(mktemp)"
cat > "$TMP" <<EOF
# Salvador-Connect (Sanatorio del Salvador) — generado por scripts/configurar-nginx-host.sh
# Solo atiende a $NOMBRE; el resto de lo que sirve este nginx no cambia.
server {
    listen 80;
    server_name $NOMBRE;

    client_max_body_size 20m;

    # Web caída o reiniciándose → pantalla «sistema no disponible» (se reintenta sola).
    error_page 502 504 =503 /__sc_caido.html;
    location = /__sc_caido.html {
        internal;
        root $PAGINAS;
        add_header Cache-Control "no-store" always;
    }

    location / {
        proxy_pass $DESTINO;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF

[ -f "$CONF" ] && sudo cp "$CONF" "$CONF.bak.$(date +%Y%m%d%H%M%S)"
sudo cp "$TMP" "$CONF"
rm -f "$TMP"
[ -n "$LINK" ] && sudo ln -sf "$CONF" "$LINK"

if ! sudo nginx -t; then
  echo "!! La configuración de nginx tiene un error: no se recargó nada. Se deja el archivo para revisar: $CONF" >&2
  [ -n "$LINK" ] && sudo rm -f "$LINK"
  exit 1
fi
sudo systemctl reload nginx 2>/dev/null || sudo nginx -s reload

# La web ofrece el instalador del acceso con esta dirección (sin puerto).
cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
set_env SITE_URL "http://$NOMBRE"
docker compose up -d --force-recreate api >/dev/null

echo
echo "== Pruebas"
sleep 4
c="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $NOMBRE" http://127.0.0.1/ || true)"
[ "$c" = 200 ] && echo "OK   http://$NOMBRE responde (vía nginx del servidor)" || echo "FALLA nginx respondió '$c' para $NOMBRE"
c="$(curl -s -H "Host: $NOMBRE" http://127.0.0.1/api/acceso || true)"
echo "$c" | grep -q "\"siteUrl\":\"http://$NOMBRE\"" && echo "OK   el sistema ofrece el acceso http://$NOMBRE" || echo "FALLA /api/acceso respondió: $c"
echo
echo "Listo. Dirección del sistema (en las PCs con el acceso instalado): http://$NOMBRE"
echo "Quien entre por http://$(leer SERVER_IP):$PUERTO desde una PC con Windows verá el botón para instalar el acceso."
echo "Para deshacer: sudo rm -f $CONF ${LINK} && sudo systemctl reload nginx"
echo "(Si cambia la pantalla de «no disponible», volver a correr este script para actualizarla.)"
