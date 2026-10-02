# Salvador-Connect

Sistema interno del **Sanatorio del Salvador**.

## Stack

- Frontend: React + Vite (`apps/web`)
- Backend: Express + TypeScript (`apps/api`)
- DB: PostgreSQL + Drizzle (`packages/db`)
- Deploy: Docker Compose (Linux)

## Producción / staging (Linux + Docker)

```bash
git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git
cd Salvador-Connect
chmod +x scripts/*.sh
bash scripts/prod-up.sh
```

Documentación: [docs/PRODUCCION.md](docs/PRODUCCION.md)

Restaurar UI completa Replit: `bash scripts/restore-frontend.sh`

## Desarrollo local

```bash
pnpm install
cp .env.example .env
pnpm run db:push
pnpm run dev:api
pnpm run dev:web
```

Uso interno — Sanatorio del Salvador.
