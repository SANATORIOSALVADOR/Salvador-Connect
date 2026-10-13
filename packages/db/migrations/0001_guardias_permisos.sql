-- 0001 · Guardias (profesionales, cobertura, auditoría) + permisos por nivel
-- Idempotente (se aplicó a mano en algunos servidores antes de existir este runner).

ALTER TABLE user_modules ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS profesionales (
  id serial PRIMARY KEY,
  name text NOT NULL,
  name_key text NOT NULL,
  matricula text NOT NULL DEFAULT '',
  especialidad text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profesionales_name_key_unique UNIQUE (name_key)
);

ALTER TABLE guardias ADD COLUMN IF NOT EXISTS professional_id integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardias_professional_id_profesionales_id_fk') THEN
    ALTER TABLE guardias ADD CONSTRAINT guardias_professional_id_profesionales_id_fk
      FOREIGN KEY (professional_id) REFERENCES profesionales(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS guardia_sectores (
  sector_id integer PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  cobertura jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT guardia_sectores_sector_id_sectors_id_fk FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guardias_auditoria (
  id serial PRIMARY KEY,
  guardia_id integer,
  action text NOT NULL,
  user_id integer,
  user_name text NOT NULL DEFAULT '',
  before jsonb,
  after jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT guardias_auditoria_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
