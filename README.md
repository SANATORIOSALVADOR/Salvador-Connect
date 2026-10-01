# Salvador-Connect

Sistema interno del **Sanatorio del Salvador**.

## Estructura

```text
apps/api          Backend Express (@salvador/api)
apps/web          Frontend React + Vite (@salvador/web)
packages/db       PostgreSQL + Drizzle
packages/api-zod  Validación Zod
packages/api-spec OpenAPI (placeholder / Orval)
packages/api-client-react
scripts/
docs/
```

## Arranque local

```bash
pnpm install
cp .env.example .env
# DATABASE_URL=postgresql://user:pass@localhost:5432/sanatorio_db

pnpm run db:push
PORT=5000 pnpm run dev:api
pnpm run dev:web
```

Si todavía existen carpetas `artifacts/` o `lib/`:

```bash
chmod +x scripts/finalize-repo.sh
./scripts/finalize-repo.sh
git push
```

Ver también: `docs/CI.md`, `docs/OPERATIVO.md`.
