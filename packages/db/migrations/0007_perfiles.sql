-- Perfiles de permisos (ej. "Encargado de sector"): definen módulos, nivel y tipo de alcance.
-- La persona queda VINCULADA a su perfil: si el perfil cambia, cambia para todos. Lo que se le cambia
-- a una persona puntual se guarda en user_modules como excepción (level distinto de 'perfil').
CREATE TABLE IF NOT EXISTS "perfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	-- { modulo: "ver" | "editar" | "total" }
	"permisos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	-- { modulo: "todos" | "carga" | "sector" } (solo módulos con sectores; los sectores se eligen en cada persona)
	"alcances" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "perfiles_nombre_uq" ON "perfiles" (lower("nombre"));

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "perfil_id" integer REFERENCES "perfiles"("id") ON DELETE SET NULL;

-- Las "plantillas de permisos" de antes pasan a ser perfiles (nadie queda vinculado: se vincula a mano).
INSERT INTO "perfiles" ("nombre", "permisos", "alcances")
SELECT
	trim(p->>'nombre'),
	COALESCE(p->'permissions', '{}'::jsonb),
	CASE
		WHEN jsonb_typeof(p->'scopes') = 'object' THEN
			COALESCE((SELECT jsonb_object_agg(e.key, e.value->'alcance') FROM jsonb_each(p->'scopes') e), '{}'::jsonb)
		WHEN jsonb_typeof(p->'sectorIds') = 'array' AND jsonb_array_length(p->'sectorIds') > 0 AND (p->'permissions') ? 'guardias' THEN
			'{"guardias": "carga"}'::jsonb
		ELSE '{}'::jsonb
	END
FROM "app_settings" s, jsonb_array_elements(CASE WHEN jsonb_typeof(s."value") = 'array' THEN s."value" ELSE '[]'::jsonb END) p
WHERE s."key" = 'plantillas_permisos' AND trim(COALESCE(p->>'nombre', '')) <> ''
ON CONFLICT DO NOTHING;
