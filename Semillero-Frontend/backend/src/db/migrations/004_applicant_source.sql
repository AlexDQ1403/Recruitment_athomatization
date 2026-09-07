-- Migration: 004_applicant_source
-- Agregar 'applicant' como fuente válida para candidatos que aplican por el portal público

ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_source_check;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_source_check
  CHECK (source IN ('internal', 'scraping', 'applicant'));
