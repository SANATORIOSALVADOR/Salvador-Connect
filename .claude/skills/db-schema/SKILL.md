---
name: db-schema
description: Schema Drizzle y PostgreSQL de Salvador-Connect. Usar al agregar columnas/tablas, errores relation does not exist, o db:push.
---

# Skill — DB Schema

## Ubicación

- Schema: `packages/db/src/schema/index.ts`
- Push: `pnpm run db:push` (filtro `@salvador/db`)

## Tablas relevantes

- users, sessions, sectors, user_modules, user_sectors
- guardias
- inventory_items, inventory_movements
- instructivos
- items de administración / agenda
- liquidacion (placeholder)

## Flujo

1. Editar schema TypeScript
2. `pnpm run db:push`
3. Actualizar rutas API
4. Si API dice tablas no creadas → falta push en ese entorno

## Cuidado

- No borrar datos de producción sin backup
- Push primero en prueba
- Migraciones versionadas formales = pendiente de producto
