-- MIGRACIÓN 026: Datos de contacto del perfil y ficha de la empresa
-- Ejecutar DESPUÉS de 025_candidate_contact_and_external_profile.sql
--
-- profiles: teléfono y cargo, editables por el propio usuario (empresa o
-- reclutador) desde /api/account/profile. El correo sigue siendo de la
-- empresa para el reclutador: es su usuario de acceso.
--
-- companies: ficha pública de la empresa, editable solo por el rol empresa
-- desde /api/account/company.

  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone     TEXT,
    ADD COLUMN IF NOT EXISTS job_title TEXT;

  ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS website     TEXT,
    ADD COLUMN IF NOT EXISTS city        TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT;

  -- Verificación
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((table_name = 'profiles'  AND column_name IN ('phone', 'job_title'))
      OR (table_name = 'companies' AND column_name IN ('website', 'city', 'description')))
  ORDER BY table_name, column_name;
