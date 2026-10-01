# CLAUDE.md

## Proyecto

Sanatorio del Salvador — Sistema Interno (`salvador-connect`).

## Estructura (definitiva)

```text
apps/api                 @salvador/api
apps/web                 @salvador/web
packages/db              @salvador/db
packages/api-spec        @salvador/api-spec
packages/api-zod         @salvador/api-zod
packages/api-client-react
scripts/
docs/
```

**No usar** carpetas legadas `artifacts/` ni `lib/` si aún aparecen (basura de migración Replit).

## Stack

Express 5 + React 19 + Vite + PostgreSQL + Drizzle. Auth por sesión (scrypt). Sin Replit, Clerk ni Supabase.

## Comandos

```bash
pnpm install
export DATABASE_URL=postgresql://...
pnpm run db:push
pnpm run dev:api
pnpm run dev:web
```

## Tramos MVP

Fundación → Administración → Guardias → Inventario (activos fijos) → Instructivos → Configuración

## Prohibido

- Paquetes `@replit/*`, Clerk, Supabase
- Inventario como stock de consumibles en el MVP
- Credenciales en el repositorio
