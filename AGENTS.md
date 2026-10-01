# AGENTS.md

Estructura **final** del monorepo. No hay “parte 1/4” pendiente.

| Path | Package |
|------|--------|
| `apps/api` | `@salvador/api` |
| `apps/web` | `@salvador/web` |
| `packages/db` | `@salvador/db` |
| `packages/api-*` | contratos |

```bash
pnpm install && pnpm run db:push
pnpm run dev:api && pnpm run dev:web
```

Sin Replit / Clerk / Supabase. Inventario = activos fijos.
