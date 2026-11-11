-- MIGRACIÓN 016: Aislar vacancies por empresa y habilitar postulaciones
-- Ejecutar DESPUÉS de 015_company_candidates_bridge.sql
--
-- PROBLEMA QUE RESUELVE:
-- 1. vacancies tiene RLS activo pero SIN políticas aplicadas (las de la
--    migración 005 nunca llegaron a la base): es deny-all y la página
--    /vacancies no muestra ni crea nada.
-- 2. La tabla no tiene company_id, solo 'company TEXT' (etiqueta libre, no
--    verificable), así que no había forma de aislarla por empresa.
-- 3. Sin postulaciones, un candidato con cuenta no puede llegar al pool de
--    ninguna empresa.

-- ============================================================================
-- 1. vacancies gana dueño real
-- ============================================================================
ALTER TABLE public.vacancies
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill: la empresa se deduce del perfil de quien creó la vacante
UPDATE public.vacancies v
SET company_id = p.company_id
FROM public.profiles p
WHERE v.created_by = p.id
  AND v.company_id IS NULL
  AND p.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vacancies_company ON public.vacancies(company_id, status);

-- NOT NULL solo si no quedaron huérfanas; si quedan, se revisan a mano antes
-- de forzarlo (esta migración no destruye datos).
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

-- ============================================================================
-- 2. Políticas de vacancies acotadas a la empresa
-- ============================================================================
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

-- La empresa y sus reclutadores gestionan sus propias vacantes
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

-- Los candidatos con cuenta ven las vacantes ACTIVAS de cualquier empresa: es
-- el catálogo al que pueden postularse. Nada de acceso anónimo — la política
-- 'TO anon' de la migración 005 servía al portal /apply, ya eliminado.
CREATE POLICY vacancies_read_candidato ON public.vacancies
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'candidato'
    )
  );

-- ============================================================================
-- 3. Postulaciones
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  vacancy_id           UUID NOT NULL REFERENCES public.vacancies(id) ON DELETE CASCADE,
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Estado visible PARA EL CANDIDATO. El estado interno del proceso vive en
  -- company_candidates.status y no se le expone.
  status               TEXT NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada', 'en_revision', 'descartada', 'contactado')),
  cover_letter         TEXT CHECK (cover_letter IS NULL OR char_length(cover_letter) <= 2000),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Una postulación por candidato y vacante: hace el alta idempotente
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

-- El candidato ve sus propias postulaciones
CREATE POLICY applications_candidate_read ON public.applications
  FOR SELECT TO authenticated
  USING (
    candidate_profile_id IN (
      SELECT id FROM public.candidate_profiles WHERE profile_id = auth.uid()
    )
  );

-- La empresa ve las que recibe
CREATE POLICY applications_company_read ON public.applications
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY applications_company_update ON public.applications
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- Sin política de INSERT: el alta la hace el backend, que además crea la
-- relación en company_candidates dentro de la misma operación.

-- Verificación
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('vacancies', 'applications')
ORDER BY tablename, cmd;
