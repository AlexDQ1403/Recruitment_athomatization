-- 029: nota privada del candidato en cada postulación

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS candidate_note TEXT
    CHECK (candidate_note IS NULL OR char_length(candidate_note) <= 1000);
