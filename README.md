# Salvador-Connect

Sistema interno modular del **Sanatorio del Salvador**.

## Estructura (final)

```text
salvador-connect/
├── apps/
│   ├── api/                 # Backend Express (@salvador/api)
│   └── web/                 # Frontend React + Vite (@salvador/web)
├── packages/
│   ├── db/                  # PostgreSQL + Drizzle
│   ├── api-spec/
│   ├── api-zod/
│   └── api-client-react/
├── scripts/
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

Si aún existen carpetas `artifacts/` o `lib/`, son legadas: `git rm -rf artifacts lib && git commit && git push`.

Uso interno — Sanatorio del Salvador.
