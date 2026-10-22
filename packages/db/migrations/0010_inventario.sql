-- Inventario (v2): equipos y bienes por planta / sector, con registro de controles, fallas y reparaciones.
-- Las tablas viejas (inventory_items / inventory_movements) quedan sin uso; sus datos se pasan acá.

CREATE TABLE IF NOT EXISTS "inv_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"planta" text DEFAULT '' NOT NULL,
	"sector_id" integer NOT NULL REFERENCES "sectors"("id"),
	"rubro" text DEFAULT '' NOT NULL,
	"tipo" text DEFAULT '' NOT NULL,
	"descripcion" text NOT NULL,
	"marca" text DEFAULT '' NOT NULL,
	"codigo_serie" text DEFAULT '' NOT NULL,
	-- operativo | con_falla | en_reparacion | fuera_servicio | baja
	"estado" text DEFAULT 'operativo' NOT NULL,
	-- Cada cuántos días se controla (null = sin control periódico).
	"frecuencia_dias" integer,
	"ultimo_control" date,
	"proximo_control" date,
	"observaciones" text DEFAULT '' NOT NULL,
	"created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "inv_items_sector_idx" ON "inv_items" ("sector_id");
CREATE INDEX IF NOT EXISTS "inv_items_proximo_idx" ON "inv_items" ("proximo_control");
-- El código de serie, si está, no se repite (sin distinguir mayúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS "inv_items_serie_uq" ON "inv_items" (lower("codigo_serie")) WHERE "codigo_serie" <> '';

-- Registro de cada equipo: controles, fallas, reparaciones, traslados, altas, cambios y bajas.
CREATE TABLE IF NOT EXISTS "inv_registros" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL REFERENCES "inv_items"("id") ON DELETE CASCADE,
	-- control | falla | reparacion | traslado | alta | cambio | baja | importacion
	"tipo" text NOT NULL,
	"fecha" date NOT NULL,
	-- en controles: ok | observacion | falla
	"resultado" text DEFAULT '' NOT NULL,
	"detalle" text DEFAULT '' NOT NULL,
	"responsable" text DEFAULT '' NOT NULL,
	"estado_nuevo" text DEFAULT '' NOT NULL,
	"user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"user_nombre" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "inv_registros_item_idx" ON "inv_registros" ("item_id", "fecha" DESC);
CREATE INDEX IF NOT EXISTS "inv_registros_fecha_idx" ON "inv_registros" ("fecha" DESC);

-- Plan de controles: cada cuánto se controla cada tipo de equipo (lo toman las altas e importaciones).
CREATE TABLE IF NOT EXISTS "inv_planes" (
	"tipo" text PRIMARY KEY NOT NULL,
	"frecuencia_dias" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Lo que hubiera en el inventario viejo (con sector) pasa al nuevo, una sola vez.
INSERT INTO "inv_items" ("sector_id", "rubro", "descripcion", "codigo_serie", "estado", "observaciones", "created_at")
SELECT
	i."sector_id",
	COALESCE(NULLIF(i."category", 'general'), ''),
	i."name",
	COALESCE(i."serial_number", ''),
	CASE i."status" WHEN 'en_reparacion' THEN 'en_reparacion' WHEN 'baja' THEN 'baja' ELSE 'operativo' END,
	COALESCE(i."location_note", ''),
	i."created_at"
FROM "inventory_items" i
WHERE i."sector_id" IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM "inv_items" LIMIT 1)
ON CONFLICT DO NOTHING;
