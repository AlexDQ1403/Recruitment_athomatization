-- Notas privadas del candidato sobre cada postulación (p. ej. "entrevista el
-- martes 10 a. m.", "les envié el portafolio"). Solo las ve el propio
-- candidato: las rutas de empresa y reclutador no seleccionan esta columna.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS candidate_note TEXT
    CHECK (candidate_note IS NULL OR char_length(candidate_note) <= 1000);
