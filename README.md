# Salvador-Connect

Sistema interno modular del **Sanatorio del Salvador**.

## Estructura profesional

```text
salvador-connect/
├── apps/
│   ├── api/                 # Backend Express (@salvador/api)
│   └── web/                 # Frontend React + Vite (@salvador/web)
├── packages/
│   ├── db/                  # PostgreSQL + Drizzle (@salvador/db)
│   ├── api-spec/            # OpenAPI
│   ├── api-zod/             # Validación Zod
│   └── api-client-react/    # Cliente React tipado
├── scripts/                 # Seeds
├── docs/                    # Alcance, arquitectura, Postgres
├── CLAUDE.md
└── AGENTS.md
```

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19 + Vite + Tailwind |
| Backend | Express 5 + TypeScript |
| Base de datos | PostgreSQL + Drizzle |
| Monorepo | pnpm workspaces |

## Desarrollo

```bash
pnpm install
cp .env.example .env
# DATABASE_URL=postgresql://...

pnpm run db:push
pnpm run dev:api    # http://localhost:5000
pnpm run dev:web    # Vite (proxy /api → API)
```

Ver `docs/POSTGRES.md` y `CLAUDE.md`.

Uso interno — Sanatorio del Salvador.
