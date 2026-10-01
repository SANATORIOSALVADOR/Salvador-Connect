# CLAUDE.md

## Proyecto

Sanatorio del Salvador — Sistema Interno.

## Estructura

```text
apps/api       @salvador/api      Backend Express
apps/web       @salvador/web      Frontend React/Vite
packages/db    @salvador/db       Drizzle + PostgreSQL
packages/api-*                    OpenAPI, Zod, cliente
scripts                           Seeds
docs                              Especificación
```

## Comandos

```bash
pnpm install
export DATABASE_URL=postgresql://...
pnpm run db:push
pnpm run dev:api
pnpm run dev:web
```

## Tramos MVP

Fundación → Administración → Guardias → Inventario → Instructivos → Configuración

## Prohibido

Replit packages, Clerk, Supabase, inventario como stock, contraseñas en el repo.
