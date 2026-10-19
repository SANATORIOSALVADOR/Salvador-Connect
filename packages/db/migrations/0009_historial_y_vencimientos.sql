-- Accesos con vencimiento: de la cuenta entera y de un permiso puntual (reemplazos, temporarios).
-- Vencida la cuenta, no puede entrar. Vencido un permiso, se ignora (si era una excepción de un
-- perfil, la persona vuelve a lo del perfil).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "acceso_hasta" date;
ALTER TABLE "user_modules" ADD COLUMN IF NOT EXISTS "hasta" date;

-- Historial de cambios de permisos: quién cambió qué a quién (Configuración → Historial).
CREATE TABLE IF NOT EXISTS "permisos_historial" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"user_nombre" text DEFAULT '' NOT NULL,
	"perfil_id" integer REFERENCES "perfiles"("id") ON DELETE SET NULL,
	"perfil_nombre" text DEFAULT '' NOT NULL,
	"actor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"actor_nombre" text DEFAULT '' NOT NULL,
	"accion" text NOT NULL,
	"detalle" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "permisos_historial_fecha_idx" ON "permisos_historial" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "permisos_historial_user_idx" ON "permisos_historial" ("user_id", "created_at" DESC);
