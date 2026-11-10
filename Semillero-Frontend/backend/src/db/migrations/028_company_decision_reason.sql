-- MIGRACIÓN 028: Motivo de la decisión de la empresa
-- Ejecutar DESPUÉS de 027_candidate_rejections.sql
--
-- Cuando la empresa contrata o descarta a un candidato que le presentó un
-- reclutador, puede dejar el motivo ("no tiene inglés", "pide más de lo
-- presupuestado"). El reclutador lo ve en su dashboard y aprende qué buscar.

ALTER TABLE public.company_candidates
  ADD COLUMN IF NOT EXISTS company_decision_reason TEXT
    CHECK (company_decision_reason IS NULL OR char_length(company_decision_reason) <= 500);

-- Verificación
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'company_candidates' AND column_name = 'company_decision_reason';
