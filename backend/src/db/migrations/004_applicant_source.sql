-- 004: fuente applicant para candidatos

ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_source_check;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_source_check
  CHECK (source IN ('internal', 'scraping', 'applicant'));
