-- MIGRACIÓN 008: Cambiar status enum a 3 estados correctos
-- Ejecutar DESPUÉS de 007_fix_candidate_source_enum.sql
-- ⚠️ IMPORTANTE: 'en_contacto' NO 'contratacion'
-- Propósito: Cambiar a modelo de 3 estados según spec

-- 1. Mapear datos existentes
-- pending/interviewed → seguimiento
UPDATE candidates SET status = 'seguimiento'
WHERE status IN ('pending', 'interviewed', 'Pendiente', 'Entrevistado');

-- rejected → rechazado
UPDATE candidates SET status = 'rechazado'
WHERE status IN ('rejected', 'Rechazado');

-- hired/contratacion → seguimiento (no es "contratado", es "en contacto")
UPDATE candidates SET status = 'seguimiento'
WHERE status IN ('hired', 'contratacion', 'Contratado');

-- 2. Eliminar constraint antiguo
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_status_check;

-- 3. Agregar nuevo constraint con 3 estados CORRECTOS
ALTER TABLE candidates ADD CONSTRAINT candidates_status_check
  CHECK (status IN ('rechazado', 'en_contacto', 'seguimiento'));

-- Verificación
SELECT DISTINCT status FROM candidates;
-- Debería retornar: rechazado, en_contacto, seguimiento (lowercase)
