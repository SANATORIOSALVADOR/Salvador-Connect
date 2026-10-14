#!/usr/bin/env bash
# Prueba el nginx de la web (deploy/nginx.conf) con Docker: API caída → pantalla «no disponible»,
# modo mantenimiento (estado/mantenimiento.json) y que las rutas permitidas sigan respondiendo.
# Uso: bash tests/nginx-estado.sh   (necesita Docker; en CI corre en GitHub Actions)
set -uo pipefail
cd "$(dirname "$0")/.."
RAIZ="$(pwd)"
T="$(mktemp -d)"
RED="sc-test-$$"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  OK   $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1 :: $2"; }
limpiar() { docker rm -f "$RED-web" "$RED-api" >/dev/null 2>&1; docker network rm "$RED" >/dev/null 2>&1; rm -rf "$T"; }
trap limpiar EXIT

mkdir -p "$T/html/estado" "$T/estado"
cp apps/web/public/estado/*.html "$T/html/estado/"
echo '<!doctype html><title>app</title><div id="root">APP</div>' > "$T/html/index.html"
chmod -R a+rX "$T"

docker network create "$RED" >/dev/null
docker run -d --name "$RED-web" --network "$RED" -p 18080:80 \
  -v "$RAIZ/deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$T/html:/usr/share/nginx/html:ro" \
  -v "$T/estado:/usr/share/nginx/estado:ro" \
  nginx:1.27-alpine >/dev/null
B=http://127.0.0.1:18080
for i in $(seq 1 30); do curl -s -o /dev/null "$B/" && break; sleep 1; done

code() { curl -s -o "$T/body" -w '%{http_code}' -X "${2:-GET}" "$B$1"; }
cuerpo() { cat "$T/body"; }

echo "== Configuración"
docker exec "$RED-web" nginx -t >/dev/null 2>&1 && ok "nginx -t" || bad "nginx -t" "$(docker exec "$RED-web" nginx -t 2>&1)"

echo "== API caída (no existe el contenedor api)"
c=$(code /); [ "$c" = 200 ] && grep -q APP "$T/body" && ok "la web abre igual" || bad "web" "$c $(cuerpo)"
c=$(code /api/users); [ "$c" = 503 ] && grep -q '"codigo":"caido"' "$T/body" && ok "/api → 503 caido" || bad "api caida" "$c $(cuerpo)"
c=$(code /api/health); [ "$c" = 503 ] && grep -q caido "$T/body" && ok "/api/health → 503 caido" || bad "health caida" "$c $(cuerpo)"
c=$(code /estado/caido.html); [ "$c" = 200 ] && grep -q "no está disponible" "$T/body" && ok "página caido.html" || bad "caido.html" "$c"

echo "== API levantada (falsa)"
docker run -d --name "$RED-api" --network "$RED" --network-alias api node:20-alpine node -e \
  "require('http').createServer((q,s)=>{s.setHeader('content-type','application/json');s.end(JSON.stringify({status:'ok',url:q.url,metodo:q.method}))}).listen(5000)" >/dev/null
for i in $(seq 1 30); do [ "$(code /api/health)" = 200 ] && break; sleep 1; done
c=$(code /api/health); [ "$c" = 200 ] && ok "/api/health → 200" || bad "health" "$c $(cuerpo)"
c=$(code "/api/users?x=1"); [ "$c" = 200 ] && grep -q '"url":"/api/users?x=1"' "$T/body" && ok "/api/users llega igual al API" || bad "proxy" "$c $(cuerpo)"

echo "== Mantenimiento prendido"
echo '{"mensaje":"Prueba","hasta":"","desde":""}' > "$T/estado/mantenimiento.json"; chmod a+r "$T/estado/mantenimiento.json"
c=$(code /dashboard); [ "$c" = 503 ] && grep -q "Estamos haciendo mantenimiento" "$T/body" && ok "páginas → 503 mantenimiento" || bad "pagina mant" "$c $(cuerpo | head -c 200)"
c=$(code /api/users); [ "$c" = 503 ] && grep -q '"codigo":"mantenimiento"' "$T/body" && ok "/api → 503 mantenimiento" || bad "api mant" "$c $(cuerpo)"
c=$(code /api/users POST); [ "$c" = 503 ] && ok "no deja guardar" || bad "post mant" "$c"
c=$(code /api/health); [ "$c" = 200 ] && ok "/api/health sigue respondiendo" || bad "health mant" "$c $(cuerpo)"
c=$(code /api/apariencia); [ "$c" = 200 ] && ok "GET /api/apariencia sigue" || bad "apariencia get" "$c"
c=$(code /api/apariencia PUT); [ "$c" = 503 ] && grep -q mantenimiento "$T/body" && ok "PUT /api/apariencia bloqueado" || bad "apariencia put" "$c $(cuerpo)"
c=$(code /estado/mantenimiento.json); [ "$c" = 200 ] && grep -q Prueba "$T/body" && ok "aviso de mantenimiento visible" || bad "json" "$c $(cuerpo)"

echo "== Mantenimiento apagado"
rm -f "$T/estado/mantenimiento.json"
c=$(code /estado/mantenimiento.json); [ "$c" = 404 ] && ok "sin aviso (404)" || bad "json off" "$c"
c=$(code /dashboard); [ "$c" = 200 ] && grep -q APP "$T/body" && ok "páginas normales" || bad "pagina off" "$c"
c=$(code /api/users); [ "$c" = 200 ] && ok "/api normal" || bad "api off" "$c"

echo; echo "RESULTADO: $PASS OK, $FAIL FALLAS"
[ "$FAIL" -eq 0 ]
