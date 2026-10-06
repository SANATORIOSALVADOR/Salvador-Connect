# AGENTS.md — Salvador-Connect

Instrucciones cortas para cualquier agente (Claude Code, etc.).

## Proyecto
Sistema interno **Sanatorio del Salvador**. Monorepo pnpm.

## Paths canónicos
| Qué | Dónde |
|-----|--------|
| API | `apps/api` (`@salvador/api`) |
| Web | `apps/web` (`@salvador/web`) |
| Schema | `packages/db/src/schema/index.ts` |
| Páginas módulo | `apps/web/src/pages/*.tsx` |
| Auth | `apps/api/src/lib/auth.ts` |
| Build UI | `Dockerfile` (overlay + CSS) |

## Flujo
Schema → `pnpm run db:push` → API → UI. Un módulo por cambio.

## Reglas de negocio fijas
- Guardias: sector + fecha + inicio/fin + modalidad `activa`/`pasiva` (sin turnos mañana/tarde).
- Inventario: **activos fijos**, no consumibles.
- Instructivos: PDF por enlace/ruta, no wiki.
- Liquidación: no implementar.
- Nombre UI: **Sanatorio del Salvador**.

## Comandos
```bash
pnpm install && pnpm run db:push
pnpm run dev:api
pnpm run dev:web
```

## No hacer
Replit / Clerk / Supabase · secretos en git · mezclar varios módulos incompletos.
