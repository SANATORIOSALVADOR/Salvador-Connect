ALTER TABLE guardias ADD COLUMN IF NOT EXISTS start_time text NOT NULL DEFAULT '08:00';
ALTER TABLE guardias ADD COLUMN IF NOT EXISTS end_time text NOT NULL DEFAULT '16:00';
ALTER TABLE guardias ALTER COLUMN shift SET DEFAULT '';
ALTER TABLE guardias ALTER COLUMN modality SET DEFAULT 'activa';
ALTER TABLE guardias ALTER COLUMN type SET DEFAULT '';

INSERT INTO sectors (name, short_name, active)
SELECT v.name, v.short_name, true
FROM (VALUES
  ('Guardia Central', 'GCE'),
  ('UTI Neo', 'UNE'),
  ('UTI UCO', 'UCO'),
  ('Piso Gineco', 'GIN'),
  ('Piso Clínica Médica', 'PCM'),
  ('Residentes', 'RES')
) AS v(name, short_name)
WHERE NOT EXISTS (SELECT 1 FROM sectors s WHERE s.short_name = v.short_name);
