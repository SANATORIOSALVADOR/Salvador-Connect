#!/usr/bin/env bash
# =============================================================================
# Salvador-Connect — instalador limpio (server de prueba / staging)
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/SANATORIOSALVADOR/Salvador-Connect/main/scripts/install.sh | bash
#   o:  git clone ... && cd Salvador-Connect && bash scripts/install.sh
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/SANATORIOSALVADOR/Salvador-Connect.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/salvador-connect}"
SERVER_IP="${SERVER_IP:-172.20.1.134}"
WEB_PORT="${WEB_PORT:-8080}"
API_PORT="${API_PORT:-5000}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta comando: $1"
}

echo ""
echo "=============================================="
echo "  Salvador-Connect — Instalación limpia"
echo "  Server: ${SERVER_IP}"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# 1. Docker
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker no encontrado. Instalando..."
  bash "$(dirname "$0")/install-docker.sh" 2>/dev/null || {
    # Si se ejecuta via curl sin repo local
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker 2>/dev/null || true
  }
fi
require_cmd docker

if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 no disponible. Instalá el plugin: docker-compose-plugin"
fi
info "Docker OK: $(docker --version)"

# ---------------------------------------------------------------------------
# 2. Clonar o actualizar repo
# ---------------------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Actualizando repo en $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only || warn "No se pudo hacer pull (continuando)"
else
  info "Clonando en $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# 3. Limpieza de legado Replit (si existe)
# ---------------------------------------------------------------------------
if [ -d artifacts ] || [ -d lib ]; then
  info "Eliminando carpetas legadas artifacts/ y lib/"
  rm -rf artifacts lib
fi

if [ -f scripts/finalize-repo.sh ]; then
  chmod +x scripts/finalize-repo.sh
  # No regeneramos lock dentro de Docker path; solo limpieza ligera
  info "finalize-repo disponible (opcional post-install)"
fi

# ---------------------------------------------------------------------------
# 4. Secrets locales (.env.deploy) — no se suben a git
# ---------------------------------------------------------------------------
ENV_FILE="$INSTALL_DIR/.env.deploy"
if [ ! -f "$ENV_FILE" ]; then
  info "Generando secrets en .env.deploy"
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  cat > "$ENV_FILE" <<EOF
# Generado por scripts/install.sh — NO COMMITEAR
SERVER_IP=${SERVER_IP}
WEB_PORT=${WEB_PORT}
API_PORT=${API_PORT}
POSTGRES_USER=sanatorio
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=sanatorio_db
DATABASE_URL=postgresql://sanatorio:${DB_PASS}@db:5432/sanatorio_db
NODE_ENV=production
EOF
  chmod 600 "$ENV_FILE"
  info "Secrets creados (chmod 600)"
else
  info "Reusando .env.deploy existente"
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# ---------------------------------------------------------------------------
# 5. docker-compose.override con secrets reales
# ---------------------------------------------------------------------------
info "Escribiendo docker-compose.override.yml"
cat > "$INSTALL_DIR/docker-compose.override.yml" <<EOF
# Generado por install.sh — local, no commitear si tiene secrets sensibles
services:
  db:
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-sanatorio}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-sanatorio_db}
    ports:
      - "127.0.0.1:5432:5432"

  api:
    environment:
      NODE_ENV: production
      PORT: "5000"
      DATABASE_URL: postgresql://${POSTGRES_USER:-sanatorio}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-sanatorio_db}
    ports:
      - "${SERVER_IP}:${API_PORT}:5000"

  web:
    ports:
      - "${SERVER_IP}:${WEB_PORT}:80"
EOF

# Asegurar .gitignore
grep -q '.env.deploy' .gitignore 2>/dev/null || echo -e '\n.env.deploy\ndocker-compose.override.yml' >> .gitignore

# ---------------------------------------------------------------------------
# 6. Build y up
# ---------------------------------------------------------------------------
info "Construyendo e iniciando contenedores (puede tardar)..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# ---------------------------------------------------------------------------
# 7. Schema DB
# ---------------------------------------------------------------------------
info "Esperando Postgres healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "${POSTGRES_USER:-sanatorio}" -d "${POSTGRES_DB:-sanatorio_db}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

info "Aplicando schema (db:push)..."
NETWORK=$(docker compose ps -q db | xargs docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)
if [ -z "$NETWORK" ]; then
  NETWORK="$(basename "$INSTALL_DIR")_default"
fi

docker run --rm --network "$NETWORK" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-sanatorio}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-sanatorio_db}" \
  -v "$INSTALL_DIR":/app -w /app \
  node:20-bookworm-slim \
  bash -c 'corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --no-frozen-lockfile && pnpm run db:push' \
  || warn "db:push falló — revisá logs. Podés reintentar luego."

# ---------------------------------------------------------------------------
# 8. Resumen
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo -e "  ${GREEN}Instalación lista${NC}"
echo "=============================================="
echo "  Web:    http://${SERVER_IP}:${WEB_PORT}"
echo "  API:    http://${SERVER_IP}:${API_PORT}/api/health"
echo "  Login:  usuario sistemas (cambiar password al entrar)"
echo "  Dir:    $INSTALL_DIR"
echo "  Secrets:$ENV_FILE (chmod 600)"
echo ""
echo "  Comandos útiles:"
echo "    cd $INSTALL_DIR && docker compose logs -f"
echo "    cd $INSTALL_DIR && docker compose ps"
echo "    cd $INSTALL_DIR && docker compose restart"
echo "=============================================="
echo ""
