# AGENTS.md

## Layout

| Path | Package |
|------|--------|
| `apps/api` | `@salvador/api` |
| `apps/web` | `@salvador/web` |
| `packages/db` | `@salvador/db` |
| `packages/api-spec` | `@salvador/api-spec` |
| `packages/api-zod` | `@salvador/api-zod` |
| `packages/api-client-react` | `@salvador/api-client-react` |

## Comandos

```bash
pnpm install
pnpm run db:push
pnpm run dev:api
pnpm run dev:web
pnpm run typecheck
```

## Reglas

- Sin Replit, Clerk ni Supabase
- Inventario = activos fijos
- Sin credenciales en el repo
- Leer `CLAUDE.md` + `docs/ALCANCE_MVP.md` antes de cambiar código
