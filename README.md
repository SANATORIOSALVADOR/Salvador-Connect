# Salvador-Connect

Sistema interno modular del **Sanatorio del Salvador**.

## Estructura

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
├── docs/
├── CLAUDE.md
└── AGENTS.md
```

## Desarrollo

```bash
pnpm install
cp .env.example .env
# DATABASE_URL=postgresql://...

pnpm run db:push
pnpm run dev:api
pnpm run dev:web
```

Ver `docs/POSTGRES.md` y `CLAUDE.md`.

Uso interno — Sanatorio del Salvador.
