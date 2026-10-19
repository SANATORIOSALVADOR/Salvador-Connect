-- Acciones concretas por módulo (el nivel queda como atajo). NULL = las acciones típicas del nivel.
ALTER TABLE "user_modules" ADD COLUMN IF NOT EXISTS "acciones" text[];
-- En perfiles: { modulo: ["ver", "cargar", ...] } solo para los módulos con acciones a medida.
ALTER TABLE "perfiles" ADD COLUMN IF NOT EXISTS "acciones" jsonb DEFAULT '{}'::jsonb NOT NULL;
