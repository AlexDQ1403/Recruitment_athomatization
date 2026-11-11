-- 024: decisión de la empresa sobre los candidatos que le presentó el reclutador

ALTER TABLE public.company_candidates
  ADD COLUMN IF NOT EXISTS company_decision   TEXT NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS company_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS company_decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.company_candidates
  DROP CONSTRAINT IF EXISTS company_candidates_company_decision_check;
ALTER TABLE public.company_candidates
  ADD CONSTRAINT company_candidates_company_decision_check
  CHECK (company_decision IN ('pendiente', 'contratado', 'descartado'));

CREATE INDEX IF NOT EXISTS idx_company_candidates_decision
  ON public.company_candidates(company_id, company_decision)
  WHERE presented_to_company = true;

NOTIFY pgrst, 'reload schema';
