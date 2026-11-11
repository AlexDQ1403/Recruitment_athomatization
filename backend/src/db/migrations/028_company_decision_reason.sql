-- 028: motivo de la decisión de la empresa

ALTER TABLE public.company_candidates
  ADD COLUMN IF NOT EXISTS company_decision_reason TEXT
    CHECK (company_decision_reason IS NULL OR char_length(company_decision_reason) <= 500);
