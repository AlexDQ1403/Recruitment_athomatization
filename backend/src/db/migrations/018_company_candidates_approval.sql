-- MIGRACIÓN 018: Aprobación del reclutador para presentar un candidato a la empresa
-- Ejecutar DESPUÉS de 017_session_audit.sql
--
-- PROBLEMA QUE RESUELVE:
-- company_candidates.status (rechazado/en_contacto/seguimiento) es el pipeline
-- interno del reclutador, no una aprobación. Hoy la RLS de company_candidates
-- da a 'empresa' y 'recruiter' exactamente el mismo acceso de lectura: en
-- cuanto un reclutador crea la relación (o llega una postulación vía
-- candidate-portal), la empresa ya la ve sin que nadie la haya revisado.
--
-- Se añade un gate de visibilidad explícito, separado del pipeline interno,
-- que solo el reclutador controla. La empresa nunca escribe en esta tabla.

-- ============================================================================
-- 1. Columnas de aprobación
-- ============================================================================
ALTER TABLE public.company_candidates
  ADD COLUMN IF NOT EXISTS presented_to_company BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS presented_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_candidates_presented
  ON public.company_candidates(company_id, presented_to_company);

-- ============================================================================
-- 2. Helper: rol del usuario actual (mismo patrón que current_company_id, 013)
-- ============================================================================
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

-- ============================================================================
-- 3. RLS: empresa solo ve relaciones presentadas; reclutador ve todo su tenant
-- ============================================================================
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

-- Escritura: solo el reclutador (el alta general la sigue haciendo el backend
-- con service_role, que ya salta RLS; esto cubre cualquier acceso directo).
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

-- ============================================================================
-- Verificación
-- ============================================================================
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'company_candidates'
ORDER BY cmd, policyname;
