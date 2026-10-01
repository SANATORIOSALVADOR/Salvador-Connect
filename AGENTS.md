# AGENTS.md — Instrucciones para agentes (Claude Code / Grok)

## Objetivo

Sistema interno del Sanatorio del Salvador. Monorepo pnpm. PostgreSQL + Drizzle. Express. Auth propia (sin Clerk, sin Supabase, sin Replit).

## Leer primero

1. `CLAUDE.md`
2. `docs/ALCANCE_MVP.md`
3. `docs/CLAUDE_CODE.md`
4. `docs/POSTGRES.md`
5. `docs/ESTADO_ACTUAL.md`

## Paquetes activos del workspace

| Path | Paquete |
|------|---------|
| `artifacts/api-server` | `@workspace/api-server` — API Express |
| `lib/db` | `@workspace/db` — schema + pool |
| `lib/api-spec` | OpenAPI |
| `lib/api-zod` | Validación |
| `lib/api-client-react` | Cliente tipado |
| `scripts` | Seeds |

**No usar** `artifacts/mockup-sandbox`: residual de Replit (preview de componentes). No está en el workspace. La app web real se construirá aparte (Vite/React) en un tramo posterior.

## Comandos

```bash
pnpm install
export DATABASE_URL=postgresql://...
pnpm run db:push
pnpm run dev:api
pnpm run typecheck
```

## Auth

Sesiones cookie + scrypt. Bootstrap superadmin en `artifacts/api-server/src/lib/auth.ts`. No documentar contraseñas en el repo.

## Prohibido

- Reintroducir Replit, Clerk, Supabase
- Inventario como stock de consumibles en el MVP
- Credenciales en README

## Estructura futura deseable (cuando Claude toque frontend)

```text
apps/api      ← hoy artifacts/api-server
apps/web      ← frontend real (crear)
packages/db   ← hoy lib/db
```

No renombrar en masa sin plan; el código actual funciona con paths `artifacts/` y `lib/`.
