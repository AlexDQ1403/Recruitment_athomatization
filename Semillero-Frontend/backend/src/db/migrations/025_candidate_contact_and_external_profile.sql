-- MIGRACIÓN 025: Perfil externo (LinkedIn) y registro de contactos
-- Ejecutar DESPUÉS de 024_company_decision.sql
--
-- 1. candidates gana `headline` y `summary`: el titular y el extracto público
--    que n8n obtiene del resultado de búsqueda de LinkedIn (SerpApi). Antes se
--    descartaban y la ficha de un candidato externo quedaba en nombre + cargo.
-- 2. candidate_contact_log: cada vez que un reclutador abre WhatsApp, correo o
--    LinkedIn para escribirle a un candidato desde la plataforma. No guarda el
--    texto del mensaje (sale por el canal externo, no por nosotros).

-- ============================================================================
-- 1. Perfil externo en candidates
-- ============================================================================
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS headline TEXT CHECK (headline IS NULL OR char_length(headline) <= 300),
  ADD COLUMN IF NOT EXISTS summary  TEXT CHECK (summary  IS NULL OR char_length(summary)  <= 2000);

-- ============================================================================
-- 2. Registro de contactos
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.candidate_contact_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recruiter_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  candidate_profile_id UUID REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  legacy_candidate_id  UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  channel              TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'linkedin')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Mismo patrón que company_candidates (015): exactamente un origen
  CONSTRAINT candidate_contact_log_one_origin CHECK (
    (candidate_profile_id IS NOT NULL AND legacy_candidate_id IS NULL)
    OR (candidate_profile_id IS NULL AND legacy_candidate_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_log_legacy
  ON public.candidate_contact_log(company_id, legacy_candidate_id, created_at DESC)
  WHERE legacy_candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_log_profile
  ON public.candidate_contact_log(company_id, candidate_profile_id, created_at DESC)
  WHERE candidate_profile_id IS NOT NULL;

-- RLS: la empresa lee los suyos; solo el backend (service_role) escribe.
ALTER TABLE public.candidate_contact_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_contact_log_company_read ON public.candidate_contact_log;
CREATE POLICY candidate_contact_log_company_read ON public.candidate_contact_log
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- Verificación
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'candidates' AND column_name IN ('headline', 'summary');
