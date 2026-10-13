-- 0004 · Administración: palabras clave por obligación para reconocerla al pegar la agenda de ARCA / Rentas.
-- Separadas por "|", sin tildes y en minúsculas. Idempotente.

ALTER TABLE adm_obligaciones ADD COLUMN IF NOT EXISTS claves text NOT NULL DEFAULT '';

UPDATE adm_obligaciones SET claves = v.claves
FROM (VALUES
  ('IVA_DJ',          'valor agregado|iva|f.2002|libro iva'),
  ('SUSS_DJ',         'seguridad social|f.931|931|suss|obras sociales'),
  ('SICORE_DJ',       'sicore|retenciones y percepciones'),
  ('SICORE_GAN_PAGO', 'sicore pago a cuenta|pago a cuenta sicore'),
  ('IIBB_DJ',         'ingresos brutos|iibb'),
  ('AGENTE_RET_Q1',   'primera quincena|1a quincena|1ra quincena|1° quincena|1º quincena'),
  ('AGENTE_RET_Q2',   'segunda quincena|2a quincena|2da quincena|2° quincena|2º quincena')
) AS v(codigo, claves)
WHERE adm_obligaciones.codigo = v.codigo AND adm_obligaciones.claves = '';
