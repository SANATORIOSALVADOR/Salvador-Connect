# CLAUDE.md — Contexto del proyecto para Claude Code

## Proyecto

**Sanatorio del Salvador — Sistema Interno (Salvador-Connect)**

Sistema interno modular de gestión administrativa para un sanatorio privado (on-premise).

## Stack

- Frontend: React 19 + TypeScript + Tailwind + shadcn/ui
- Backend: Express 5 + TypeScript
- DB: **PostgreSQL puro** + Drizzle ORM (sin Supabase)
- Auth: sesiones propias (cookie httpOnly + scrypt)
- Monorepo: pnpm workspaces
- Infra objetivo: Linux sobre Proxmox

## Roles

- `superadmin` → Administrador General (acceso total)
- `responsable_sector` → solo gestiona sus sectores
- `usuario` → consulta limitada a sus sectores

## Módulos MVP (orden de tramos)

1. Fundación (Login + Layout + Roles + Sectores + Dashboard)
2. Administración (Agenda + Recordatorios + Calendario + campanita)
3. Guardias (carga, calendario por sector, alerta cobertura, modalidad Presencial/Retención)
4. Inventario (activos fijos, asignación a sector, historial de movimientos)
5. Instructivos (PDF formales por sector)
6. Configuración (ABM usuarios, sectores, catálogos)
7. Liquidación → solo placeholder

## Decisiones ya tomadas

- PostgreSQL puro (NO Supabase).
- Inventario = activos fijos (no consumibles en MVP).
- Cambio de sector de un activo = registro en `inventory_movements`.
- Recordatorios de Agenda: solo dentro del sistema (campanita) en MVP.
- Instructivos: PDFs formales (no wiki).
- Referencias UX: Snipe-IT, BookStack, Vikunja, BetterShift/Grafana OnCall.

## Estructura

```
artifacts/api-server/     → Backend Express
lib/db/                   → Schema Drizzle + pool PG
lib/api-spec/             → OpenAPI
lib/api-zod/              → Validación
lib/api-client-react/     → Cliente tipado
docs/                     → Alcance, arquitectura, Postgres, Claude Code
scripts/src/              → Seeds y utilidades
```

## Comandos

```bash
export DATABASE_URL="postgresql://..."
pnpm --filter @workspace/db run push          # schema → DB
pnpm --filter @workspace/api-server run dev   # API
pnpm run typecheck
pnpm exec tsx scripts/src/seed-sectors.ts     # sectores de ejemplo
```

Ver también: `docs/POSTGRES.md`, `docs/CLAUDE_CODE.md`.

## Reglas de negocio

- Filtro automático por sector en Guardias e Inventario (excepto superadmin).
- Bootstrap de superadmin en el primer arranque (`artifacts/api-server/src/lib/auth.ts`).
- Credenciales de bootstrap: solo equipo; **no** publicar en README.

## Qué NO hacer

- No reintroducir Supabase.
- No modelar Inventario como stock de consumibles en el MVP.
- No Email/WhatsApp de recordatorios en el MVP.
- No implementar Liquidación (solo placeholder).
- No documentar contraseñas en el repositorio.

## Cómo trabajar con Claude Code

1. Leer este archivo + `docs/ALCANCE_MVP.md` + `docs/CLAUDE_CODE.md`.
2. Un tramo a la vez: schema → API → UI → probar.
3. Tipado estricto y Zod en endpoints.
4. Tras cambiar schema: `pnpm --filter @workspace/db run push` y actualizar docs de estado si hace falta.
