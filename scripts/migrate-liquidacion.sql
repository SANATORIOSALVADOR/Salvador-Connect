CREATE TABLE IF NOT EXISTS liquidacion_items (
  id serial PRIMARY KEY,
  title text NOT NULL,
  item_type text NOT NULL DEFAULT 'vencimiento',
  status text NOT NULL DEFAULT 'pendiente',
  due_date date NOT NULL,
  amount text NOT NULL DEFAULT '',
  responsible_name text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  alert_days integer NOT NULL DEFAULT 3,
  created_by_user_id integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS liquidacion_items_due_date_idx ON liquidacion_items (due_date);
CREATE INDEX IF NOT EXISTS liquidacion_items_status_idx ON liquidacion_items (status);
