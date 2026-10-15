# Base de datos: migraciones

## Migraciones (automáticas)

- Cada cambio de base es un archivo `packages/db/migrations/NNNN_nombre.sql`.
- **La API los aplica sola al arrancar**, en orden, una sola vez cada uno (tabla `schema_migrations`),
  cada archivo en una transacción: si falla, no queda a medias y la API sigue funcionando con lo que había.
- En el servidor no hay que hacer nada extra: `docker compose up -d --force-recreate api` alcanza.
  Para ver qué aplicó: `bash scripts/db-migrate.sh` (reinicia la API y muestra el log).

### Crear una migración nueva (desarrollo)

1. Cambiar el schema en `packages/db/src/schema/index.ts`.
2. Escribir `packages/db/migrations/NNNN_descripcion.sql` con el SQL del cambio, **idempotente**
   (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, FKs dentro de `DO $$ … IF NOT EXISTS …`).
   Para ver el SQL que propone drizzle: `drizzle-kit generate` con un `out` temporal.
3. Probar sobre una base con el schema anterior: al arrancar la API se aplica, y
   `drizzle-kit push` contra esa base tiene que decir *No changes detected*.
4. No modificar migraciones ya publicadas: siempre agregar una nueva.

`pnpm run db:push` sigue sirviendo para bases de desarrollo descartables.

## Backups

El sistema no hace backups propios: las copias de la base de datos y del servidor las hace el área de
Sistemas con su propio programa, por fuera del sistema. Los datos de Postgres están en el volumen Docker `pgdata`.
