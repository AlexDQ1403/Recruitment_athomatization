-- MIGRACIÓN 030: Postulaciones a ofertas de otros sitios web
-- Ejecutar DESPUÉS de 029_application_candidate_note.sql
--
-- El candidato ve ofertas de otros portales (Get on Board, Google Jobs) y se
-- postula EN ESE SITIO. Aquí solo queda su registro personal para llevar el
-- control: el otro sitio no nos avisa si avanzó, así que el estado lo
-- actualiza el propio candidato. Solo lo lee y escribe el backend (service
-- role) filtrando por el candidato de la sesión: RLS activo y sin políticas.

CREATE TABLE IF NOT EXISTS public.external_applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  source               TEXT NOT NULL CHECK (char_length(source) <= 40),
  title                TEXT NOT NULL CHECK (char_length(title) <= 200),
  company              TEXT CHECK (company IS NULL OR char_length(company) <= 200),
  location             TEXT CHECK (location IS NULL OR char_length(location) <= 200),
  url                  TEXT NOT NULL CHECK (char_length(url) <= 2048 AND url ~* '^https?://'),
  status               TEXT NOT NULL DEFAULT 'postulado'
    CHECK (status IN ('postulado', 'en_proceso', 'entrevista', 'oferta', 'no_seleccionado')),
  match_score          SMALLINT CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 100),
  note                 TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  applied_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_changed_at    TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Una vez por oferta: confirmar dos veces no duplica
  UNIQUE (candidate_profile_id, url)
);

CREATE INDEX IF NOT EXISTS idx_external_applications_candidate
  ON public.external_applications(candidate_profile_id, applied_at DESC);

DROP TRIGGER IF EXISTS trg_external_applications_updated_at ON public.external_applications;
CREATE TRIGGER trg_external_applications_updated_at
  BEFORE UPDATE ON public.external_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.external_applications ENABLE ROW LEVEL SECURITY;

-- Verificación
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'external_applications'
ORDER BY ordinal_position;
