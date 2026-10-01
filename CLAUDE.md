# CLAUDE.md — Contexto para Claude Code

## Proyecto

**Sanatorio del Salvador — Sistema Interno (Salvador-Connect)**

Monorepo pnpm limpio (sin dependencias de Replit Agent, sin Clerk, sin Supabase).

## Stack

- Backend: Express 5 + TypeScript (`artifacts/api-server`)
- DB: PostgreSQL + Drizzle (`lib/db`)
- Validación: Zod (`lib/api-zod`) + OpenAPI (`lib/api-spec`)
- Auth: sesiones propias (cookie httpOnly + scrypt)
- Frontend real: pendiente (no usar `mockup-sandbox`)
- Infra: Linux / Proxmox

## Leer también

- `AGENTS.md` — reglas cortas para agentes
- `docs/ALCANCE_MVP.md`
- `docs/CLAUDE_CODE.md`
- `docs/POSTGRES.md`
- `docs/ESTADO_ACTUAL.md`
- `docs/LIMPIEZA_REPLIT.md`

## Roles

- `superadmin` — Administrador General
- `responsable_sector` — solo sus sectores
- `usuario` — consulta limitada

## Tramos MVP

1. Fundación → 2. Administración → 3. Guardias → 4. Inventario (activos fijos) → 5. Instructivos → 6. Configuración → 7. Liquidación (placeholder)

## Comandos

```bash
pnpm install
export DATABASE_URL="postgresql://user:pass@localhost:5432/sanatorio_db"
pnpm run db:push
pnpm run db:seed-sectors
pnpm run dev:api
pnpm run typecheck
```

## Qué NO hacer

- No reinstalar paquetes `@replit/*` ni Clerk ni Supabase
- No tratar Inventario como stock de consumibles en el MVP
- No publicar contraseñas en el repo
- No basar el frontend en `artifacts/mockup-sandbox` (residual Replit; se puede borrar al crear `apps/web`)

## Bootstrap

Usuario superadmin se crea al primer arranque de la API si no existe (`artifacts/api-server/src/lib/auth.ts`). Credenciales solo del equipo.
