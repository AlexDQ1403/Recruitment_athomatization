-- 014: cuentas de candidato

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('empresa', 'recruiter', 'candidato', 'superAdmin'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_company_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_company_role_check
  CHECK (
    (role = 'candidato'  AND company_id IS NULL)
    OR (role = 'superAdmin')
    OR (role IN ('empresa', 'recruiter') AND company_id IS NOT NULL)
  );

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

ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_profiles_own    ON public.candidate_profiles;
DROP POLICY IF EXISTS candidate_profiles_update ON public.candidate_profiles;

CREATE POLICY candidate_profiles_own ON public.candidate_profiles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY candidate_profiles_update ON public.candidate_profiles
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
