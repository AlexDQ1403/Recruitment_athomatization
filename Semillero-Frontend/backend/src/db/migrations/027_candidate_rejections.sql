-- MIGRACIÓN 027: Rechazos por puesto
-- Ejecutar DESPUÉS de 026_account_profile_details.sql
--
-- Antes un rechazo era global: candidates.status / company_candidates.status =
-- 'rechazado' y el candidato quedaba descartado para todo. Una persona puede no
-- ser idónea para un puesto y sí para otro, así que el rechazo ahora es por
-- puesto: el cargo de la búsqueda del chat ("contador público") y/o una vacante.
--
-- Los 'rechazado' globales que ya existen se conservan como estaban (descartados
-- para todo); los rechazos nuevos se guardan aquí y no tocan el estado global.

CREATE TABLE IF NOT EXISTS public.candidate_rejections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_profile_id UUID REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  legacy_candidate_id  UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  -- Puesto tal como lo escribió el reclutador (o el título de la vacante)
  role_label           TEXT NOT NULL CHECK (char_length(role_label) BETWEEN 1 AND 160),
  -- Raíces normalizadas del puesto (backend/src/services/searchTerms.ts): "contador público" → "contad publi"
  role_key             TEXT NOT NULL CHECK (char_length(role_key) BETWEEN 1 AND 200),
  vacancy_id           UUID REFERENCES public.vacancies(id) ON DELETE SET NULL,
  reason               TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  rejected_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_rejections_one_origin CHECK (
    (candidate_profile_id IS NOT NULL AND legacy_candidate_id IS NULL)
    OR (candidate_profile_id IS NULL AND legacy_candidate_id IS NOT NULL)
  )
);

-- Un mismo puesto no se rechaza dos veces para el mismo candidato
CREATE UNIQUE INDEX IF NOT EXISTS uq_rejection_legacy_role
  ON public.candidate_rejections(company_id, legacy_candidate_id, role_key)
  WHERE legacy_candidate_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rejection_profile_role
  ON public.candidate_rejections(company_id, candidate_profile_id, role_key)
  WHERE candidate_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rejections_vacancy
  ON public.candidate_rejections(vacancy_id)
  WHERE vacancy_id IS NOT NULL;

-- RLS: la empresa lee los suyos; solo el backend (service_role) escribe.
ALTER TABLE public.candidate_rejections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_rejections_company_read ON public.candidate_rejections;
CREATE POLICY candidate_rejections_company_read ON public.candidate_rejections
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- Verificación
SELECT count(*) AS rechazos FROM public.candidate_rejections;
