# Test en server Linux con Docker

Esto es un **test de producción ligera** (staging), no el go-live del sanatorio.

## Qué prueba

- PostgreSQL en contenedor
- API Express en contenedor
- Frontend estático servido por nginx (proxy `/api` → API)
- Login bootstrap

## Requisitos del server

- Docker + Docker Compose v2
- Git
- Puertos libres: `8080` (web), opcional `5000` (API), `5432` (Postgres)

## Pasos

```bash
# 1. Clonar
git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git
cd Salvador-Connect
git pull

# 2. (Recomendado) limpiar legado si aún existen artifacts/ y lib/
chmod +x scripts/finalize-repo.sh
./scripts/finalize-repo.sh || true

# 3. Levantar stack
docker compose up -d --build

# 4. Crear tablas (una vez)
docker compose exec api sh -c 'echo "Si el contenedor api no trae drizzle-kit, corré db:push desde un contenedor node temporal"'
```

### Aplicar schema (opción simple con contenedor one-shot)

```bash
docker compose up -d db
# Esperar healthy
docker run --rm --network salvador-connect_default \
  -e DATABASE_URL=postgresql://sanatorio:sanatorio@db:5432/sanatorio_db \
  -v "$PWD":/app -w /app node:20-bookworm-slim \
  bash -c "corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --no-frozen-lockfile && pnpm run db:push"
```

(El nombre de red puede ser `salvador-connect_default` o similar; ver `docker network ls`.)

## Probar

- Web: `http://IP_DEL_SERVER:8080`
- Health API: `http://IP_DEL_SERVER:5000/api/health`
- Login: usuario `sistemas` (cambiar contraseña en cuanto entre)

## Qué NO es todavía

- HTTPS / dominio / certificados
- Backups de Postgres
- Secrets fuera de compose (hoy la pass de DB es de prueba)
- Hardening de red / firewall
- CI verde garantizado en build (si falla el build Docker, revisar logs)

## Si el build falla

```bash
docker compose build --no-cache api 2>&1 | tail -80
docker compose logs api --tail=100
```

Causas frecuentes: falta `pnpm-lock.yaml` fresco, o `packages/` incompletos → correr `./scripts/finalize-repo.sh` y volver a buildear.
