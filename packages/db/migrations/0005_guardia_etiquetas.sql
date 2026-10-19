-- Catálogo de etiquetas de Guardias (ej. GUARDIA EXTRA, REEMPLAZO). Lo administra el superadmin
-- en Configuración → Etiquetas. Cada guardia sigue guardando el texto y el color de su etiqueta
-- (tag_label / tag_color), así el historial no cambia si una etiqueta se desactiva.
CREATE TABLE IF NOT EXISTS "guardia_etiquetas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"color" text DEFAULT '#0d9488' NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "guardia_etiquetas_nombre_uq" ON "guardia_etiquetas" (lower("nombre"));

-- Etiquetas que antes venían fijas en la pantalla de carga.
INSERT INTO "guardia_etiquetas" ("nombre", "color") VALUES
	('GUARDIA EXTRA', '#c2410c'),
	('COBERTURA', '#1d4ed8'),
	('REEMPLAZO', '#7c3aed'),
	('URGENTE', '#b91c1c')
ON CONFLICT DO NOTHING;

-- Etiquetas escritas a mano en guardias ya cargadas: pasan al catálogo (en mayúsculas, con el último color usado).
INSERT INTO "guardia_etiquetas" ("nombre", "color")
SELECT DISTINCT ON (lower(trim("tag_label"))) upper(trim("tag_label")), COALESCE(NULLIF("tag_color", ''), '#0d9488')
FROM "guardias"
WHERE trim("tag_label") <> ''
ORDER BY lower(trim("tag_label")), "id" DESC
ON CONFLICT DO NOTHING;

-- Desde ahora el catálogo manda: las guardias toman el nombre y el color de su etiqueta.
UPDATE "guardias" g
SET "tag_label" = e."nombre", "tag_color" = e."color"
FROM "guardia_etiquetas" e
WHERE trim(g."tag_label") <> '' AND lower(trim(g."tag_label")) = lower(e."nombre");
