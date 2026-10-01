# Guía para Claude Code

Este documento complementa `CLAUDE.md` en la raíz.

## Antes de tocar código

1. Leer `CLAUDE.md` y `docs/ALCANCE_MVP.md`.
2. Revisar `docs/ESTADO_ACTUAL.md` y `docs/POSTGRES.md`.
3. Trabajar **por tramos**: no mezclar módulos incompletos.

## Comandos útiles

```bash
# Typecheck de todo el monorepo
pnpm run typecheck

# Schema → PostgreSQL
pnpm --filter @workspace/db run push

# API en desarrollo
pnpm --filter @workspace/api-server run dev

# Seed sectores (dev)
pnpm exec tsx scripts/src/seed-sectors.ts
```

## Dónde está cada cosa

| Qué | Dónde |
|-----|--------|
| Schema DB | `lib/db/src/schema/index.ts` |
| Auth + bootstrap | `artifacts/api-server/src/lib/auth.ts` |
| Rutas API | `artifacts/api-server/src/routes/` |
| OpenAPI | `lib/api-spec/openapi.yaml` |
| Validación Zod generada | `lib/api-zod/` |
| Cliente React | `lib/api-client-react/` |

## Reglas al implementar un módulo

1. Schema primero (`lib/db`) → `pnpm --filter @workspace/db run push`.
2. Endpoints + validación Zod.
3. Actualizar OpenAPI si el contrato cambia (`lib/api-spec`) y regenerar cliente si aplica.
4. UI solo después de que la API responda correctamente.
5. Respetar filtro por sector (excepto `superadmin`).

## Inventario (importante)

- Modelo = **activos fijos** (marca, modelo, serie, estado, sector).
- Movimiento entre sectores = fila en `inventory_movements`.
- No modelar stock de consumibles en el MVP.

## Guardias (importante)

- Campos: sector, fecha, shift, **modality** (`presencial` | `retencion`), profesional, observaciones.
- Shifts: `manana` | `tarde` | `noche` | `pasiva` | `otro`.

## No hacer

- No agregar Supabase.
- No poner contraseñas en README o issues.
- No implementar Liquidación ni notificaciones externas en el MVP.
