-- 007: normalizar enum de CandidateSource

UPDATE candidates SET source = 'internal' WHERE source = 'Interno';
UPDATE candidates SET source = 'scraping' WHERE source = 'Web scraping';
UPDATE candidates SET source = 'applicant' WHERE source = 'Solicitante';

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_source_check;

ALTER TABLE candidates ADD CONSTRAINT candidates_source_check
  CHECK (source IN ('internal', 'scraping', 'applicant'));
