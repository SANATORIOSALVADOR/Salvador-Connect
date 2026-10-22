-- Inventario: lista de verificación por tipo de equipo, resultado punto por punto en cada control
-- y proveedor / service en reparaciones.

-- Un tipo puede tener lista de verificación sin control periódico.
ALTER TABLE "inv_planes" ALTER COLUMN "frecuencia_dias" DROP NOT NULL;
-- ["Presión en verde", "Precinto", ...]
ALTER TABLE "inv_planes" ADD COLUMN IF NOT EXISTS "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- [{ "item": "Presión en verde", "estado": "ok" | "obs" | "falla", "nota": "" }]
ALTER TABLE "inv_registros" ADD COLUMN IF NOT EXISTS "checklist" jsonb;
-- Proveedor o service (envíos a reparación y reparaciones).
ALTER TABLE "inv_registros" ADD COLUMN IF NOT EXISTS "proveedor" text DEFAULT '' NOT NULL;
