-- 008: cambiar status enum a 3 estados correctos

UPDATE candidates SET status = 'seguimiento'
WHERE status IN ('pending', 'interviewed', 'Pendiente', 'Entrevistado');

UPDATE candidates SET status = 'rechazado'
WHERE status IN ('rejected', 'Rechazado');

UPDATE candidates SET status = 'seguimiento'
WHERE status IN ('hired', 'contratacion', 'Contratado');

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_status_check;

ALTER TABLE candidates ADD CONSTRAINT candidates_status_check
  CHECK (status IN ('rechazado', 'en_contacto', 'seguimiento'));
