# PostgreSQL — Guía de setup

## Requisitos

- PostgreSQL 15 o 16
- Variable `DATABASE_URL` con formato:

```text
postgresql://USUARIO:PASSWORD@HOST:5432/NOMBRE_DB
```

Ejemplo local:

```text
postgresql://sanatorio:sanatorio@localhost:5432/sanatorio_db
```

## Crear la base (local)

```bash
sudo -u postgres psql
CREATE USER sanatorio WITH PASSWORD 'sanatorio';
CREATE DATABASE sanatorio_db OWNER sanatorio;
GRANT ALL PRIVILEGES ON DATABASE sanatorio_db TO sanatorio;
\q
```

## Aplicar el schema (Drizzle)

Desde la raíz del monorepo:

```bash
export DATABASE_URL="postgresql://sanatorio:sanatorio@localhost:5432/sanatorio_db"
pnpm --filter @workspace/db run push
```

`drizzle-kit push` sincroniza el schema de `lib/db/src/schema/index.ts` con la base.

## Seed de sectores (opcional, desarrollo)

```bash
export DATABASE_URL="..."
pnpm exec tsx scripts/src/seed-sectors.ts
```

## Arranque de la API

```bash
export DATABASE_URL="..."
export PORT=5000
pnpm --filter @workspace/api-server run dev
```

En el primer arranque se crea el usuario administrador bootstrap (ver código en `artifacts/api-server/src/lib/auth.ts`). Credenciales solo para el equipo; no documentar en el repo.

## Tablas principales

| Tabla | Módulo |
|-------|--------|
| `sectors`, `users`, `user_sectors`, `user_modules`, `sessions` | Fundación / Configuración |
| `agenda_items`, `reminders` | Administración |
| `guardias` | Guardias (shift + modality) |
| `inventory_items`, `inventory_movements` | Inventario activos fijos |
| `instructivos` | Instructivos PDF |

## Notas

- No se usa Supabase. PostgreSQL puro + Drizzle.
- En producción preferir migraciones versionadas cuando el schema se estabilice; por ahora `push` alcanza para MVP.
