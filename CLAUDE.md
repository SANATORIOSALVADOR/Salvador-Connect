# CLAUDE.md

## Proyecto

Sanatorio del Salvador — Sistema Interno.

## Estructura FINAL (sin partes pendientes)

```text
apps/api       @salvador/api
apps/web       @salvador/web
packages/db    @salvador/db
packages/api-*
scripts/
docs/
```

Ignorar y eliminar si aparecen: `artifacts/`, `lib/` (legado Replit).

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
