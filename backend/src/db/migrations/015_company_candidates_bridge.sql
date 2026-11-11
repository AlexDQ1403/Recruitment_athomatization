-- 015: tabla puente empresa ↔ candidato

CREATE TABLE IF NOT EXISTS public.company_candidates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_profile_id UUID REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  legacy_candidate_id  UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'seguimiento'
    CHECK (status IN ('rechazado', 'en_contacto', 'seguimiento')),
  source               TEXT NOT NULL DEFAULT 'internal'
    CHECK (source IN ('internal', 'scraping', 'applicant')),
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT company_candidates_one_origin CHECK (
    (candidate_profile_id IS NOT NULL AND legacy_candidate_id IS NULL)
    OR (candidate_profile_id IS NULL AND legacy_candidate_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_candidate_profile
  ON public.company_candidates(company_id, candidate_profile_id)
  WHERE candidate_profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_candidate_legacy
  ON public.company_candidates(company_id, legacy_candidate_id)
  WHERE legacy_candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_candidates_company
  ON public.company_candidates(company_id, status);
CREATE INDEX IF NOT EXISTS idx_company_candidates_profile
  ON public.company_candidates(candidate_profile_id);

DROP TRIGGER IF EXISTS trg_company_candidates_updated_at ON public.company_candidates;
CREATE TRIGGER trg_company_candidates_updated_at
  BEFORE UPDATE ON public.company_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.company_candidates
  (company_id, legacy_candidate_id, status, source, created_by, created_at)
SELECT c.company_id, c.id, c.status, c.source, c.created_by, c.created_at
FROM public.candidates c
WHERE c.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.company_candidates cc
    WHERE cc.legacy_candidate_id = c.id AND cc.company_id = c.company_id
  );

COMMENT ON COLUMN public.candidates.company_id IS
  'DEPRECADA desde la migración 015: la relación vive en company_candidates. Se conserva durante la transición.';

ALTER TABLE public.company_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_candidates_read   ON public.company_candidates;
DROP POLICY IF EXISTS company_candidates_write  ON public.company_candidates;
DROP POLICY IF EXISTS company_candidates_update ON public.company_candidates;

CREATE POLICY company_candidates_read ON public.company_candidates
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY company_candidates_write ON public.company_candidates
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY company_candidates_update ON public.company_candidates
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS candidate_profiles_company_read ON public.candidate_profiles;

CREATE POLICY candidate_profiles_company_read ON public.candidate_profiles
  FOR SELECT TO authenticated
  USING (
    visible = true
    AND EXISTS (
      SELECT 1 FROM public.company_candidates cc
      WHERE cc.candidate_profile_id = candidate_profiles.id
        AND cc.company_id = public.current_company_id()
    )
  );
