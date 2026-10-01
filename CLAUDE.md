# CLAUDE.md — Contexto del proyecto para Claude Code

## Proyecto

**Sanatorio del Salvador — Sistema Interno (Salvador-Connect)**

Sistema interno modular de gestión administrativa para un sanatorio privado.

## Stack

- Frontend: React 19 + TypeScript + Tailwind + shadcn/ui
- Backend: Express 5 + TypeScript
- DB: PostgreSQL + Drizzle ORM (puro, sin Supabase)
- Auth: sesiones propias (cookie httpOnly + scrypt)
- Monorepo: pnpm workspaces
- Infra objetivo: Linux sobre Proxmox

## Roles

- `superadmin` → Administrador General (acceso total)
- `responsable_sector` → solo gestiona sus sectores
- `usuario` → consulta limitada a sus sectores

## Módulos MVP (orden de construcción)

1. Fundación (Login + Layout + Roles + Sectores + Dashboard)
2. Administración (Agenda + Recordatorios + Calendario + campanita)
3. Guardias (carga, calendario por sector, alerta cobertura, modalidad Presencial/Retención)
4. Inventario (activos fijos, asignación permanente a sector, historial de movimientos)
5. Instructivos (PDF formales por sector)
6. Configuración (ABM usuarios, sectores, catálogos)
7. Liquidación → solo placeholder

## Decisiones de diseño ya tomadas

- Base de datos: PostgreSQL puro (NO Supabase)
- Inventario: activos fijos (equipos médicos, informáticos, mobiliario). NO consumibles en el MVP.
- Cambio de sector de un activo = registro en historial de movimientos.
- Recordatorios de Agenda: solo dentro del sistema (campanita) en el MVP.
- Instructivos: repositorio de PDFs formales (no wiki colaborativa).
- Referencias de diseño: Snipe-IT (Inventario), BookStack (Instructivos), Vikunja (Agenda), BetterShift/Grafana OnCall (Guardias).

## Estructura de carpetas relevante

```
artifacts/api-server/     → Backend Express
lib/db/                   → Schema Drizzle + conexión
lib/api-spec/             → OpenAPI
lib/api-zod/              → Validación
lib/api-client-react/     → Cliente tipado
```

## Reglas de negocio importantes

- Filtrado automático por sector en Guardias e Inventario.
- Solo Responsable de Sector o Admin puede editar guardias/inventario de su sector.
- Bootstrap de usuario `saceliz` (superadmin) en el primer arranque.
- Trazabilidad en movimientos de activos y creación de guardias.

## Qué NO hacer

- No reintroducir Supabase.
- No convertir Inventario en stock de consumibles en el MVP.
- No implementar notificaciones por Email/WhatsApp en el MVP.
- No implementar módulo de Liquidación (solo placeholder).

## Cómo trabajar

1. Leer este archivo y `docs/ALCANCE_MVP.md`.
2. Trabajar por tramos (módulo completo → probar → pulir → siguiente).
3. Mantener tipado estricto y validación Zod en los endpoints.
4. Cualquier cambio de schema → actualizar `lib/db/src/schema` y documentar.

## Usuario bootstrap

- Username: `saceliz`
- Role: `superadmin`
- Se crea automáticamente si no existe (ver `artifacts/api-server/src/lib/auth.ts`).
