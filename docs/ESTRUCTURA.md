# Estructura del monorepo (completa)

```text
apps/
  api/       @salvador/api       Backend Express
  web/       @salvador/web       Frontend React + Vite
packages/
  db/        @salvador/db        PostgreSQL + Drizzle
  api-spec/  @salvador/api-spec  OpenAPI + Orval
  api-zod/   @salvador/api-zod   Schemas Zod
  api-client-react/
scripts/
docs/
```

**Deprecado (eliminar si aún aparece):** `artifacts/`, `lib/`, `mockup-sandbox`.

## Comandos

```bash
pnpm install
pnpm run db:push
pnpm run dev:api
pnm run dev:web
```
