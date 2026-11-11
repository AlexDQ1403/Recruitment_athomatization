-- 020: hoja de vida estructurada + preferencias de búsqueda del candidato

ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS professional_title TEXT,
  ADD COLUMN IF NOT EXISTS professional_summary TEXT CHECK (professional_summary IS NULL OR char_length(professional_summary) <= 2000);

CREATE TABLE IF NOT EXISTS public.candidate_experience (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  company_name         TEXT NOT NULL,
  role_title           TEXT NOT NULL,
  start_date           DATE NOT NULL,
  end_date             DATE,
  description          TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_experience_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_candidate_experience_profile ON public.candidate_experience(candidate_profile_id);

CREATE TABLE IF NOT EXISTS public.candidate_education (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  institution          TEXT NOT NULL,
  degree               TEXT NOT NULL,
  start_date           DATE,
  end_date             DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_education_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_candidate_education_profile ON public.candidate_education(candidate_profile_id);

CREATE TABLE IF NOT EXISTS public.candidate_skills (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL DEFAULT 'tecnica'
    CHECK (category IN ('tecnica', 'blanda', 'idioma', 'herramienta')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_profile_id, name)
);
CREATE INDEX IF NOT EXISTS idx_candidate_skills_profile ON public.candidate_skills(candidate_profile_id);

CREATE TABLE IF NOT EXISTS public.candidate_search_preferences (
  candidate_profile_id UUID PRIMARY KEY REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  target_position      TEXT,
  technologies          TEXT[] NOT NULL DEFAULT '{}',
  sectors               TEXT[] NOT NULL DEFAULT '{}',
  modality              TEXT CHECK (modality IS NULL OR modality IN ('presencial', 'remoto', 'híbrido')),
  keywords              TEXT[] NOT NULL DEFAULT '{}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_candidate_search_preferences_updated_at ON public.candidate_search_preferences;
CREATE TRIGGER trg_candidate_search_preferences_updated_at
  BEFORE UPDATE ON public.candidate_search_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['candidate_experience', 'candidate_education', 'candidate_skills', 'candidate_search_preferences']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I_own ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_own ON public.%I
        FOR ALL TO authenticated
        USING (candidate_profile_id IN (SELECT id FROM public.candidate_profiles WHERE profile_id = auth.uid()))
        WITH CHECK (candidate_profile_id IN (SELECT id FROM public.candidate_profiles WHERE profile_id = auth.uid()))
    $p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_company_read ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_company_read ON public.%I
        FOR SELECT TO authenticated
        USING (
          candidate_profile_id IN (
            SELECT candidate_profile_id FROM public.company_candidates
            WHERE company_id = public.current_company_id() AND candidate_profile_id IS NOT NULL
          )
        )
    $p$, t, t);
  END LOOP;
END $$;
