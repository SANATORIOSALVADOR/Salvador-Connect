-- Medical → Cancelaciones Médicos: pedidos de cancelación / reprogramación de agenda de consultorio.
-- Los carga el médico desde un formulario público (QR, red interna) y los resuelve el personal de Medical.
-- Mismos campos que la "Planilla de reprogramación de agenda de consultorio" en papel.

CREATE TABLE IF NOT EXISTS "med_cancelaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	-- Datos del prestador y servicio
	"prestador" text NOT NULL,
	"matricula" text NOT NULL,
	"dni" text NOT NULL,
	"servicio" text NOT NULL,
	"telefono" text DEFAULT '' NOT NULL,
	-- Pedido
	"pacientes_agendados" boolean NOT NULL,
	"hay_colega" boolean NOT NULL,
	"colega" text DEFAULT '' NOT NULL,
	-- formacion | vacaciones | personales | licencia
	"motivo" text NOT NULL,
	"motivo_detalle" text DEFAULT '' NOT NULL,
	-- [{ "fecha": "2026-11-20", "desde": "08:00", "hasta": "12:00" }]
	"dias" jsonb NOT NULL,
	"fecha_desde" date NOT NULL,
	"fecha_hasta" date NOT NULL,
	"fecha_reprogramacion" date,
	-- Días hábiles entre el pedido y el primer día a cancelar; menos de 15 = excepcional
	"anticipacion_habiles" integer NOT NULL,
	"excepcional" boolean DEFAULT false NOT NULL,
	"justificacion" text DEFAULT '' NOT NULL,
	-- pendiente | en_analisis | aceptada | rechazada
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"respuesta" text DEFAULT '' NOT NULL,
	"constancia_recibida" boolean DEFAULT false NOT NULL,
	"central_informada_at" timestamp with time zone,
	"central_informada_por" text DEFAULT '' NOT NULL,
	"resuelto_por_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"resuelto_por" text DEFAULT '' NOT NULL,
	"resuelto_at" timestamp with time zone,
	-- Línea de tiempo: [{ "at": "...", "quien": "...", "accion": "...", "detalle": "..." }]
	"eventos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "med_cancelaciones_estado_idx" ON "med_cancelaciones" ("estado", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "med_cancelaciones_dni_idx" ON "med_cancelaciones" ("dni");
