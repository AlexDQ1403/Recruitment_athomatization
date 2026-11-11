-- 018: aprobación del reclutador para presentar un candidato a la empresa

ALTER TABLE public.company_candidates
  ADD COLUMN IF NOT EXISTS presented_to_company BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS presented_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_candidates_presented
  ON public.company_candidates(company_id, presented_to_company);

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_role() FROM public;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;

DROP POLICY IF EXISTS company_candidates_read        ON public.company_candidates;
DROP POLICY IF EXISTS company_candidates_read_recruiter ON public.company_candidates;
DROP POLICY IF EXISTS company_candidates_read_empresa   ON public.company_candidates;

CREATE POLICY company_candidates_read_recruiter ON public.company_candidates
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_role() IN ('recruiter', 'superAdmin')
  );

CREATE POLICY company_candidates_read_empresa ON public.company_candidates
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_role() = 'empresa'
    AND presented_to_company = true
  );

DROP POLICY IF EXISTS company_candidates_write  ON public.company_candidates;
CREATE POLICY company_candidates_write ON public.company_candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.current_role() = 'recruiter'
  );

DROP POLICY IF EXISTS company_candidates_update ON public.company_candidates;
CREATE POLICY company_candidates_update ON public.company_candidates
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() = 'recruiter')
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() = 'recruiter');
