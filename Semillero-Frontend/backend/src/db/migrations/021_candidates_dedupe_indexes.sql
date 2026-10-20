-- 021: índices únicos parciales para deduplicar candidatos por empresa.
--
-- ANTES DE APLICAR, revisar duplicados existentes (si devuelven filas, limpiarlos
-- primero o la creación del índice fallará):
--
--   SELECT company_id, lower(email) AS email, count(*)
--   FROM public.candidates WHERE email IS NOT NULL
--   GROUP BY 1, 2 HAVING count(*) > 1;
--
--   SELECT company_id, linkedin_url, count(*)
--   FROM public.candidates WHERE linkedin_url IS NOT NULL
--   GROUP BY 1, 2 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_company_email_uniq
  ON public.candidates (company_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_company_linkedin_uniq
  ON public.candidates (company_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL;
