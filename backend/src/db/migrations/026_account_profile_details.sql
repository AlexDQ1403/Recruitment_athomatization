-- 026: datos de contacto del perfil y ficha de la empresa

  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone     TEXT,
    ADD COLUMN IF NOT EXISTS job_title TEXT;

  ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS website     TEXT,
    ADD COLUMN IF NOT EXISTS city        TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT;
