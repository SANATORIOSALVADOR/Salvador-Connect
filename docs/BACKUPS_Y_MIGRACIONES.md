# Base de datos: migraciones y backups

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

## Backups (automáticos)

- Servicio `backup` de `docker-compose.yml`: todos los días a partir de las `BACKUP_HOUR` (03 h)
  guarda `backups/sanatorio_AAAA-MM-DD_HHMM.dump` (pg_dump comprimido) y borra los de más de
  `BACKUP_KEEP_DAYS` días (14). Se configura en `.env`.
- **Backup en el momento:** `bash scripts/backup-now.sh`
- **Ver backups:** `bash scripts/restore-backup.sh`
- **Restaurar:** `bash scripts/restore-backup.sh sanatorio_2026-10-14_0300.dump`
  (pide escribir RESTAURAR; antes hace un backup del estado actual).

### Recomendado

Copiar la carpeta `backups/` a otro equipo o disco (por ejemplo con una tarea programada):
si se rompe el disco del servidor, los backups que están en el mismo disco se pierden con él.
