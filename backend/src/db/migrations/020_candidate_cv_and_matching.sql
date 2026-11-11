-- MIGRACIÓN 020: Hoja de vida estructurada + preferencias de búsqueda del candidato
-- Ejecutar DESPUÉS de 019_profile_avatar.sql
--
-- CONTEXTO (confirmado por /graphify y specs/registro_multi_rol_design.md:54):
-- el chat de reclutadores (backend/src/routes/chat.ts) hoy solo busca en la
-- tabla legada `candidates`. Los candidatos con cuenta propia (candidate_profiles)
-- son invisibles para esa búsqueda — la migración 015 ya dejó anotado que
-- "una migración posterior unificará ambos orígenes cuando el flujo nuevo esté
-- validado en uso". Esta migración prepara esos datos; chat.ts se actualiza
-- en el mismo cambio para leer de ambos orígenes.
--
-- DISEÑO: el archivo de CV (candidate_profiles.cv_url, ya existe) es solo un
-- documento para que el reclutador lo abra — nunca se parsea ni reemplaza los
-- campos manuales. Lo que alimenta la búsqueda son los campos estructurados
-- de esta migración (estilo LinkedIn), no el archivo.

-- ============================================================================
-- 1. candidate_profiles gana encabezado tipo LinkedIn
-- ============================================================================
ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS professional_title TEXT,
  ADD COLUMN IF NOT EXISTS professional_summary TEXT CHECK (professional_summary IS NULL OR char_length(professional_summary) <= 2000);

-- ============================================================================
-- 2. Experiencia laboral
-- ============================================================================
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

-- ============================================================================
-- 3. Formación académica
-- ============================================================================
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

-- ============================================================================
-- 4. Habilidades (técnicas, blandas, idiomas, herramientas)
-- ============================================================================
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

-- ============================================================================
-- 5. Preferencias de búsqueda / matching — separadas del CV a propósito
-- ============================================================================
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

-- ============================================================================
-- 6. RLS — mismo patrón que candidate_profiles (014) y su lectura por empresa
-- (015): el dueño lee/escribe la suya; la empresa relacionada solo lee.
-- ============================================================================
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

-- Verificación
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('candidate_experience', 'candidate_education', 'candidate_skills', 'candidate_search_preferences');
