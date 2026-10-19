-- Alcance por módulo: cada permiso (usuario + módulo) define sobre qué sectores trabaja la persona.
--   alcance = 'todos'   → ve y trabaja en todos los sectores
--             'carga'   → ve todo, pero carga / modifica solo en sus sectores (sector_ids)
--             'sector'  → ve y trabaja solo en sus sectores
-- Con sector_ids vacío, 'carga' y 'sector' se toman como 'todos'.
ALTER TABLE "user_modules" ADD COLUMN IF NOT EXISTS "alcance" text DEFAULT 'todos' NOT NULL;
ALTER TABLE "user_modules" ADD COLUMN IF NOT EXISTS "sector_ids" integer[] DEFAULT '{}' NOT NULL;

-- Hasta ahora los "sectores a cargo" eran uno solo para todo el sistema y limitaban dónde se carga:
-- pasan a los módulos con sectores, con el mismo comportamiento (ve todo, carga en sus sectores).
UPDATE "user_modules" um
SET "sector_ids" = s.ids, "alcance" = 'carga'
FROM (
	SELECT "user_id", array_agg(DISTINCT "sector_id" ORDER BY "sector_id") AS ids
	FROM "user_sectors"
	GROUP BY "user_id"
) s
WHERE um."user_id" = s."user_id"
	AND um."module_key" IN ('guardias', 'inventario', 'instructivos')
	AND cardinality(um."sector_ids") = 0;
