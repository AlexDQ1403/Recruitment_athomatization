-- 016: aislar vacancies por empresa y habilitar postulaciones

ALTER TABLE public.vacancies
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.vacancies v
SET company_id = p.company_id
FROM public.profiles p
WHERE v.created_by = p.id
  AND v.company_id IS NULL
  AND p.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vacancies_company ON public.vacancies(company_id, status);

DO $$
DECLARE orphans INT;
BEGIN
  SELECT count(*) INTO orphans FROM public.vacancies WHERE company_id IS NULL;
  IF orphans = 0 THEN
    ALTER TABLE public.vacancies ALTER COLUMN company_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'vacancies: % fila(s) sin company_id. Se omite NOT NULL; revísalas y reejecuta.', orphans;
  END IF;
END $$;

DROP POLICY IF EXISTS "Autenticados leen vacantes"       ON public.vacancies;
DROP POLICY IF EXISTS "Reclutadores crean vacantes"      ON public.vacancies;
DROP POLICY IF EXISTS "Reclutadores actualizan vacantes" ON public.vacancies;
DROP POLICY IF EXISTS "SuperAdmin elimina vacantes"      ON public.vacancies;
DROP POLICY IF EXISTS "Público lee vacantes activas"     ON public.vacancies;
DROP POLICY IF EXISTS vacancies_read_own_company   ON public.vacancies;
DROP POLICY IF EXISTS vacancies_insert_own_company ON public.vacancies;
DROP POLICY IF EXISTS vacancies_update_own_company ON public.vacancies;
DROP POLICY IF EXISTS vacancies_delete_empresa     ON public.vacancies;
DROP POLICY IF EXISTS vacancies_read_candidato     ON public.vacancies;

ALTER TABLE public.vacancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY vacancies_read_own_company ON public.vacancies
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY vacancies_insert_own_company ON public.vacancies
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY vacancies_update_own_company ON public.vacancies
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY vacancies_delete_empresa ON public.vacancies
  FOR DELETE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'empresa'
    )
  );

CREATE POLICY vacancies_read_candidato ON public.vacancies
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'candidato'
    )
  );

CREATE TABLE IF NOT EXISTS public.applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  vacancy_id           UUID NOT NULL REFERENCES public.vacancies(id) ON DELETE CASCADE,
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada', 'en_revision', 'descartada', 'contactado')),
  cover_letter         TEXT CHECK (cover_letter IS NULL OR char_length(cover_letter) <= 2000),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (candidate_profile_id, vacancy_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_candidate ON public.applications(candidate_profile_id);
CREATE INDEX IF NOT EXISTS idx_applications_company   ON public.applications(company_id, status);

DROP TRIGGER IF EXISTS trg_applications_updated_at ON public.applications;
CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applications_candidate_read  ON public.applications;
DROP POLICY IF EXISTS applications_company_read    ON public.applications;
DROP POLICY IF EXISTS applications_company_update  ON public.applications;

CREATE POLICY applications_candidate_read ON public.applications
  FOR SELECT TO authenticated
  USING (
    candidate_profile_id IN (
      SELECT id FROM public.candidate_profiles WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY applications_company_read ON public.applications
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY applications_company_update ON public.applications
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
