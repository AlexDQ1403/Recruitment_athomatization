-- 021: índices únicos para deduplicar candidatos por empresa

CREATE UNIQUE INDEX IF NOT EXISTS candidates_company_email_uniq
  ON public.candidates (company_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_company_linkedin_uniq
  ON public.candidates (company_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL;
