-- 0002 · Configuración general (apariencia)
-- Idempotente (se aplicó a mano en algunos servidores antes de existir este runner).

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
