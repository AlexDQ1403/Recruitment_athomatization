-- MIGRACIÓN 024: Decisión de la empresa sobre los candidatos que le presentó el reclutador
-- Ejecutar DESPUÉS de 023_vacancies_align_checks.sql
--
-- company_candidates.status es el pipeline del RECLUTADOR (seguimiento / en_contacto /
-- rechazado) y presented_to_company es la aprobación del reclutador. La empresa necesita
-- su propia decisión, independiente: contratar o descartar a quien le llegó.
--
-- Idempotente: se puede ejecutar más de una vez.

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

-- La empresa no escribe por RLS: lo hace el backend (service role) tras validar rol y empresa.

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT company_decision, count(*) FROM public.company_candidates GROUP BY company_decision;
