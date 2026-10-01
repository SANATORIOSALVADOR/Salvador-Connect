#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR:-$HOME/salvador-connect}"
SERVER_IP="${SERVER_IP:-172.20.1.134}"
WEB_PORT="${WEB_PORT:-8080}"
API_PORT="${API_PORT:-5000}"

cd "$INSTALL_DIR" 2>/dev/null || { echo "No está instalado en $INSTALL_DIR"; exit 1; }

echo "=== Contenedores ==="
docker compose ps
echo ""
echo "=== Health API ==="
curl -sS -m 5 "http://${SERVER_IP}:${API_PORT}/api/health" || echo "API no responde"
echo ""
echo "=== Web ==="
curl -sS -m 5 -o /dev/null -w "HTTP %{http_code}\n" "http://${SERVER_IP}:${WEB_PORT}/" || echo "Web no responde"
