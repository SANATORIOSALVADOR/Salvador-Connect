-- Medical → Cancelaciones Médicos: Central de Turnos.
-- Una solicitud aceptada pasa a la solapa «Central de Turnos»; cuando el personal de turnos cancela la agenda en el
-- sistema de agendas la marca y queda en estado «agenda_cancelada» (quién, cuándo y una observación).
ALTER TABLE "med_cancelaciones" ADD COLUMN IF NOT EXISTS "agenda_cancelada_at" timestamp with time zone;
ALTER TABLE "med_cancelaciones" ADD COLUMN IF NOT EXISTS "agenda_cancelada_por_id" integer REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "med_cancelaciones" ADD COLUMN IF NOT EXISTS "agenda_cancelada_por" text DEFAULT '' NOT NULL;
ALTER TABLE "med_cancelaciones" ADD COLUMN IF NOT EXISTS "central_nota" text DEFAULT '' NOT NULL;
CREATE INDEX IF NOT EXISTS "med_cancelaciones_central_idx" ON "med_cancelaciones" ("estado", "fecha_desde");
