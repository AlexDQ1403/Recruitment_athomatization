-- MIGRACIÓN 019: Foto de perfil para todos los roles
-- Ejecutar DESPUÉS de 018_company_candidates_approval.sql
--
-- Una sola columna en profiles sirve para empresa, reclutador, superAdmin y
-- candidato: todos son filas de profiles, y ya existe profiles_update_own
-- (013) para que cada quien edite la suya. No se duplica en candidate_profiles.
--
-- NOTA DE DESPLIEGUE: esta migración no crea el bucket de Storage. Debe
-- crearse a mano en el dashboard de Supabase (bucket público 'avatars'),
-- igual que se hizo en su momento con 'resumes' — ninguna migración de este
-- proyecto crea buckets por SQL.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url';
