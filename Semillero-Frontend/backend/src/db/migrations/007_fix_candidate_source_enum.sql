-- MIGRACIÓN 007: Normalizar enum de CandidateSource
-- Ejecutar DESPUÉS de 006_empresa_jerarquia.sql
-- Propósito: Unificar valores de source a lowercase (internal, scraping, applicant)

-- 1. Mapear valores antiguos a lowercase
UPDATE candidates SET source = 'internal' WHERE source = 'Interno';
UPDATE candidates SET source = 'scraping' WHERE source = 'Web scraping';
UPDATE candidates SET source = 'applicant' WHERE source = 'Solicitante';

-- 2. Eliminar constraint antiguo
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_source_check;

-- 3. Agregar nuevo constraint con valores correctos
ALTER TABLE candidates ADD CONSTRAINT candidates_source_check
  CHECK (source IN ('internal', 'scraping', 'applicant'));

-- Verificación
SELECT DISTINCT source FROM candidates;
-- Debería retornar: internal, scraping, applicant (lowercase)
