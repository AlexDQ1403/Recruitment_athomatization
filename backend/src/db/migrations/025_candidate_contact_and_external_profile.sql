-- 025: perfil externo (LinkedIn) y registro de contactos

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS headline TEXT CHECK (headline IS NULL OR char_length(headline) <= 300),
  ADD COLUMN IF NOT EXISTS summary  TEXT CHECK (summary  IS NULL OR char_length(summary)  <= 2000);

CREATE TABLE IF NOT EXISTS public.candidate_contact_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recruiter_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  candidate_profile_id UUID REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  legacy_candidate_id  UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  channel              TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'linkedin')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

ALTER TABLE public.candidate_contact_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_contact_log_company_read ON public.candidate_contact_log;
CREATE POLICY candidate_contact_log_company_read ON public.candidate_contact_log
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
