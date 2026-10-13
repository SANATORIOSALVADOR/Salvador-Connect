-- 0003 · Administración v2
-- Catálogo de obligaciones, calendario oficial por mes, feriados, recurrentes, contactos,
-- ítems con registro de cumplimiento e historial. Copia lo que había en liquidacion_items
-- (la tabla vieja queda intacta). Idempotente.

CREATE TABLE IF NOT EXISTS adm_obligaciones (
  id serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  organismo text NOT NULL DEFAULT 'arca',
  periodicidad text NOT NULL DEFAULT 'mensual',
  mes_anual integer,
  dia_estimado integer NOT NULL DEFAULT 20,
  desfase_periodo integer NOT NULL DEFAULT -1,
  presentacion boolean NOT NULL DEFAULT true,
  pago boolean NOT NULL DEFAULT true,
  responsable text NOT NULL DEFAULT '',
  alert_days integer NOT NULL DEFAULT 7,
  referencia text NOT NULL DEFAULT '',
  notas text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT adm_obligaciones_codigo_unique UNIQUE (codigo)
);

CREATE TABLE IF NOT EXISTS adm_calendario (
  id serial PRIMARY KEY,
  obligacion_id integer NOT NULL CONSTRAINT adm_calendario_obligacion_id_adm_obligaciones_id_fk REFERENCES adm_obligaciones(id) ON DELETE CASCADE,
  anio integer NOT NULL,
  mes integer NOT NULL,
  fecha date NOT NULL,
  origen text NOT NULL DEFAULT 'oficial',
  norma text NOT NULL DEFAULT '',
  verificado_por integer CONSTRAINT adm_calendario_verificado_por_users_id_fk REFERENCES users(id) ON DELETE SET NULL,
  verificado_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT adm_calendario_oblig_mes_uq UNIQUE (obligacion_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS adm_feriados (
  fecha date PRIMARY KEY,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'inamovible'
);

CREATE TABLE IF NOT EXISTS adm_recurrentes (
  id serial PRIMARY KEY,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'pago',
  descripcion text NOT NULL DEFAULT '',
  frecuencia text NOT NULL DEFAULT 'mensual',
  dia integer NOT NULL DEFAULT 10,
  desde date NOT NULL,
  hasta date,
  habiles boolean NOT NULL DEFAULT true,
  monto text NOT NULL DEFAULT '',
  responsable text NOT NULL DEFAULT '',
  alert_days integer NOT NULL DEFAULT 3,
  omitidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_by_user_id integer CONSTRAINT adm_recurrentes_created_by_user_id_users_id_fk REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adm_items (
  id serial PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'recordatorio',
  titulo text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  fecha date NOT NULL,
  hora text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'pendiente',
  prioridad text NOT NULL DEFAULT 'normal',
  responsable text NOT NULL DEFAULT '',
  monto text NOT NULL DEFAULT '',
  alert_days integer NOT NULL DEFAULT 3,
  obligacion_id integer CONSTRAINT adm_items_obligacion_id_adm_obligaciones_id_fk REFERENCES adm_obligaciones(id) ON DELETE SET NULL,
  periodo text,
  fecha_origen text NOT NULL DEFAULT 'manual',
  recurrente_id integer CONSTRAINT adm_items_recurrente_id_adm_recurrentes_id_fk REFERENCES adm_recurrentes(id) ON DELETE SET NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  presentado boolean NOT NULL DEFAULT false,
  pagado boolean NOT NULL DEFAULT false,
  cumplido_fecha date,
  comprobante text NOT NULL DEFAULT '',
  monto_pagado text NOT NULL DEFAULT '',
  cumplimiento_nota text NOT NULL DEFAULT '',
  cumplido_por integer CONSTRAINT adm_items_cumplido_por_users_id_fk REFERENCES users(id),
  legacy_id integer,
  created_by_user_id integer CONSTRAINT adm_items_created_by_user_id_users_id_fk REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT adm_items_legacy_id_unique UNIQUE (legacy_id)
);
CREATE INDEX IF NOT EXISTS adm_items_fecha_idx ON adm_items (fecha);
CREATE UNIQUE INDEX IF NOT EXISTS adm_items_fiscal_uq ON adm_items (obligacion_id, periodo) WHERE obligacion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS adm_items_recurrente_uq ON adm_items (recurrente_id, fecha) WHERE recurrente_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS adm_contactos (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  rubro text NOT NULL DEFAULT '',
  persona text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  cuit text NOT NULL DEFAULT '',
  notas text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adm_historial (
  id serial PRIMARY KEY,
  entidad text NOT NULL,
  entidad_id integer,
  accion text NOT NULL,
  detalle text NOT NULL DEFAULT '',
  user_id integer,
  user_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adm_historial_entidad_idx ON adm_historial (entidad, entidad_id);

-- Obligaciones que ya generaba la versión anterior. Los días son ESTIMADOS: la fecha exacta
-- se carga del calendario oficial (ARCA / Rentas Córdoba) en Administración → Fiscal.
INSERT INTO adm_obligaciones (codigo, nombre, organismo, dia_estimado, desfase_periodo, presentacion, pago, referencia, orden) VALUES
  ('AGENTE_RET_Q2',   'Agente de retención — 2ª quincena', 'arca',       10, -1, true,  true, 'Régimen de retención · 2ª quincena del mes anterior', 10),
  ('SICORE_DJ',       'SICORE — Declaración jurada',       'arca',       13, -1, true,  true, 'SICORE · DJ del mes anterior', 20),
  ('SUSS_DJ',         'SUSS / F.931 — Cargas sociales',    'arca',       13, -1, true,  true, 'F.931 · Seguridad social del mes anterior', 30),
  ('IIBB_DJ',         'Ingresos Brutos Córdoba — DJ',      'rentas_cba', 19, -1, true,  true, 'IIBB Córdoba · DJ del mes anterior', 40),
  ('IVA_DJ',          'IVA — Declaración jurada',          'arca',       22, -1, true,  true, 'F.2002 · IVA y Libro IVA Digital del mes anterior', 50),
  ('SICORE_GAN_PAGO', 'SICORE Ganancias — Pago a cuenta',  'arca',       22,  0, false, true, 'SICORE · pago a cuenta del mes en curso', 60),
  ('AGENTE_RET_Q1',   'Agente de retención — 1ª quincena', 'arca',       23,  0, true,  true, 'Régimen de retención · 1ª quincena del mes en curso', 70)
ON CONFLICT (codigo) DO NOTHING;

-- Feriados nacionales y días no laborables 2026 (fuente: api.argentinadatos.com, oct-2026).
INSERT INTO adm_feriados (fecha, nombre, tipo) VALUES
  ('2026-01-01', 'Año nuevo', 'inamovible'),
  ('2026-02-16', 'Carnaval', 'inamovible'),
  ('2026-02-17', 'Carnaval', 'inamovible'),
  ('2026-03-23', 'Puente turístico no laborable', 'puente'),
  ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'inamovible'),
  ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'inamovible'),
  ('2026-04-03', 'Viernes Santo', 'inamovible'),
  ('2026-05-01', 'Día del Trabajador', 'inamovible'),
  ('2026-05-25', 'Día de la Revolución de Mayo', 'inamovible'),
  ('2026-06-15', 'Paso a la Inmortalidad del General Martín Güemes (17/6)', 'trasladable'),
  ('2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', 'inamovible'),
  ('2026-07-09', 'Día de la Independencia', 'inamovible'),
  ('2026-07-10', 'Puente turístico no laborable', 'puente'),
  ('2026-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín', 'trasladable'),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'trasladable'),
  ('2026-11-09', 'Visita del papa León XIV', 'inamovible'),
  ('2026-11-23', 'Día de la Soberanía Nacional (20/11)', 'trasladable'),
  ('2026-12-07', 'Puente turístico no laborable', 'puente'),
  ('2026-12-08', 'Día de la Inmaculada Concepción de María', 'inamovible'),
  ('2026-12-25', 'Navidad', 'inamovible')
ON CONFLICT (fecha) DO NOTHING;

-- Copia de los ítems de la versión anterior (liquidacion_items). Los fiscales se reconocen por la
-- marca [FISCAL:CODIGO:AAAA-MM] de las notas y se enlazan a su obligación.
INSERT INTO adm_items (tipo, titulo, descripcion, fecha, estado, responsable, monto, alert_days,
                       obligacion_id, periodo, fecha_origen, legacy_id, created_by_user_id, created_at, updated_at)
SELECT
  CASE
    WHEN o.id IS NOT NULL THEN 'fiscal'
    WHEN li.item_type IN ('pago', 'cheque', 'recordatorio', 'vencimiento') THEN li.item_type
    WHEN li.item_type = 'seguro' THEN 'documento'
    WHEN li.item_type = 'liquidacion' THEN 'pago'
    WHEN li.item_type = 'nota' THEN 'recordatorio'
    ELSE 'vencimiento'
  END,
  li.title,
  btrim(regexp_replace(regexp_replace(li.notes, '\[FISCAL:[^\]]*\]\s*', '', 'g'), 'CUIT [0-9-]+\s*', '', 'g')),
  li.due_date,
  CASE lower(li.status) WHEN 'hecho' THEN 'cumplido' WHEN 'anulado' THEN 'cancelado'
    WHEN 'cumplido' THEN 'cumplido' WHEN 'cancelado' THEN 'cancelado' ELSE 'pendiente' END,
  li.responsible_name,
  li.amount,
  li.alert_days,
  o.id,
  CASE WHEN o.id IS NOT NULL THEN substring(li.notes from '\[FISCAL:[A-Z0-9_]+:([0-9]{4}-[0-9]{2})\]') END,
  CASE WHEN o.id IS NOT NULL THEN 'estimada' ELSE 'manual' END,
  li.id,
  li.created_by_user_id,
  li.created_at,
  li.updated_at
FROM liquidacion_items li
LEFT JOIN adm_obligaciones o ON o.codigo = substring(li.notes from '\[FISCAL:([A-Z0-9_]+):')
ORDER BY li.id
ON CONFLICT DO NOTHING;

UPDATE adm_items SET datos = jsonb_build_object('categoria', 'seguro')
WHERE tipo = 'documento' AND legacy_id IS NOT NULL AND datos = '{}'::jsonb;

UPDATE adm_items SET presentado = true, pagado = true, cumplido_fecha = updated_at::date
WHERE estado = 'cumplido' AND legacy_id IS NOT NULL AND cumplido_fecha IS NULL;
