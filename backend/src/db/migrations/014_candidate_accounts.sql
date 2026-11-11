-- MIGRACIÓN 014: Cuentas de candidato
-- Ejecutar DESPUÉS de 013_secure_profiles_rls.sql
--
-- Introduce el rol 'candidato' y su perfil. Un candidato con cuenta NO tiene
-- company_id: es una identidad independiente que varias empresas pueden ver a
-- través de la tabla puente de la migración 015.

-- ============================================================================
-- 1. Admitir el rol 'candidato'
-- ============================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('empresa', 'recruiter', 'candidato', 'superAdmin'));

-- Un candidato nunca pertenece a una empresa; una empresa o reclutador sí.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_company_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_company_role_check
  CHECK (
    (role = 'candidato'  AND company_id IS NULL)
    OR (role = 'superAdmin')
    OR (role IN ('empresa', 'recruiter') AND company_id IS NOT NULL)
  );

-- ============================================================================
-- 2. Perfil del candidato
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  position         TEXT,
  experience_years INT CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 60),
  expected_salary  NUMERIC(12,2) CHECK (expected_salary IS NULL OR expected_salary >= 0),
  location         TEXT,
  phone            TEXT,
  cv_url           TEXT,
  linkedin_url     TEXT,
  -- Si el candidato se oculta, deja de aparecer en las búsquedas de empresas
  visible          BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_profile ON public.candidate_profiles(profile_id);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_visible ON public.candidate_profiles(visible);

DROP TRIGGER IF EXISTS trg_candidate_profiles_updated_at ON public.candidate_profiles;
CREATE TRIGGER trg_candidate_profiles_updated_at
  BEFORE UPDATE ON public.candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 3. RLS
-- ============================================================================
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_profiles_own    ON public.candidate_profiles;
DROP POLICY IF EXISTS candidate_profiles_update ON public.candidate_profiles;

-- El candidato ve y edita su propia ficha.
-- La visibilidad para las empresas se añade en 015, cuando existe el puente.
CREATE POLICY candidate_profiles_own ON public.candidate_profiles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY candidate_profiles_update ON public.candidate_profiles
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- Sin política de INSERT/DELETE: el alta la hace el backend con service_role
-- durante el registro, y la baja cae en cascada con el profile.

-- Verificación
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND conname LIKE '%role%';
