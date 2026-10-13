-- 0000 · Esquema base (oct-2026). Idempotente: en una base existente solo crea lo que falte.
-- Generado desde packages/db/src/schema con drizzle-kit y adaptado:
--   CREATE TABLE → IF NOT EXISTS; cada FK solo si la columna existe y la FK todavía no.


CREATE TABLE IF NOT EXISTS "agenda_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'tarea' NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"due_date" date NOT NULL,
	"responsible_name" text DEFAULT '' NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "guardia_sectores" (
	"sector_id" integer PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cobertura" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "guardias_auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"guardia_id" integer,
	"action" text NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "guardias" (
	"id" serial PRIMARY KEY NOT NULL,
	"sector_id" integer NOT NULL,
	"date" date NOT NULL,
	"end_date" date,
	"shift" text DEFAULT '' NOT NULL,
	"start_time" text DEFAULT '08:00' NOT NULL,
	"end_time" text DEFAULT '16:00' NOT NULL,
	"modality" text DEFAULT 'activa' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"professional_name" text NOT NULL,
	"professional_id" integer,
	"observations" text DEFAULT '' NOT NULL,
	"tag_label" text DEFAULT '' NOT NULL,
	"tag_color" text DEFAULT '' NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "instructivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"sector_id" integer,
	"file_path" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer
);

CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"serial_number" text,
	"status" text DEFAULT 'activo' NOT NULL,
	"sector_id" integer,
	"location_note" text DEFAULT '' NOT NULL,
	"acquired_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"from_sector_id" integer,
	"to_sector_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moved_by_user_id" integer
);

CREATE TABLE IF NOT EXISTS "liquidacion_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"item_type" text DEFAULT 'vencimiento' NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"due_date" date NOT NULL,
	"amount" text DEFAULT '' NOT NULL,
	"responsible_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"alert_days" integer DEFAULT 3 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "profesionales" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"matricula" text DEFAULT '' NOT NULL,
	"especialidad" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profesionales_name_key_unique" UNIQUE("name_key")
);

CREATE TABLE IF NOT EXISTS "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"agenda_item_id" integer,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE IF NOT EXISTS "user_modules" (
	"user_id" integer NOT NULL,
	"module_key" text NOT NULL,
	"level" text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_sectors" (
	"user_id" integer NOT NULL,
	"sector_id" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'usuario' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_items_created_by_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'agenda_items' AND column_name = 'created_by_user_id') THEN
    ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardia_sectores_sector_id_sectors_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guardia_sectores' AND column_name = 'sector_id') THEN
    ALTER TABLE "guardia_sectores" ADD CONSTRAINT "guardia_sectores_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardias_auditoria_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guardias_auditoria' AND column_name = 'user_id') THEN
    ALTER TABLE "guardias_auditoria" ADD CONSTRAINT "guardias_auditoria_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardias_sector_id_sectors_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guardias' AND column_name = 'sector_id') THEN
    ALTER TABLE "guardias" ADD CONSTRAINT "guardias_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardias_professional_id_profesionales_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guardias' AND column_name = 'professional_id') THEN
    ALTER TABLE "guardias" ADD CONSTRAINT "guardias_professional_id_profesionales_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."profesionales"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardias_created_by_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'guardias' AND column_name = 'created_by_user_id') THEN
    ALTER TABLE "guardias" ADD CONSTRAINT "guardias_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructivos_sector_id_sectors_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'instructivos' AND column_name = 'sector_id') THEN
    ALTER TABLE "instructivos" ADD CONSTRAINT "instructivos_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructivos_created_by_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'instructivos' AND column_name = 'created_by_user_id') THEN
    ALTER TABLE "instructivos" ADD CONSTRAINT "instructivos_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_sector_id_sectors_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'inventory_items' AND column_name = 'sector_id') THEN
    ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_item_id_inventory_items_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'inventory_movements' AND column_name = 'item_id') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_from_sector_id_sectors_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'inventory_movements' AND column_name = 'from_sector_id') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_sector_id_sectors_id_fk" FOREIGN KEY ("from_sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_to_sector_id_sectors_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'inventory_movements' AND column_name = 'to_sector_id') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_sector_id_sectors_id_fk" FOREIGN KEY ("to_sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_moved_by_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'inventory_movements' AND column_name = 'moved_by_user_id') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_moved_by_user_id_users_id_fk" FOREIGN KEY ("moved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'liquidacion_items_created_by_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'liquidacion_items' AND column_name = 'created_by_user_id') THEN
    ALTER TABLE "liquidacion_items" ADD CONSTRAINT "liquidacion_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_agenda_item_id_agenda_items_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'reminders' AND column_name = 'agenda_item_id') THEN
    ALTER TABLE "reminders" ADD CONSTRAINT "reminders_agenda_item_id_agenda_items_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."agenda_items"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sessions' AND column_name = 'user_id') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_modules_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'user_modules' AND column_name = 'user_id') THEN
    ALTER TABLE "user_modules" ADD CONSTRAINT "user_modules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sectors_user_id_users_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'user_sectors' AND column_name = 'user_id') THEN
    ALTER TABLE "user_sectors" ADD CONSTRAINT "user_sectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sectors_sector_id_sectors_id_fk')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'user_sectors' AND column_name = 'sector_id') THEN
    ALTER TABLE "user_sectors" ADD CONSTRAINT "user_sectors_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
