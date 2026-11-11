-- MIGRACIÓN 012: Añadir suspensión y último acceso a profiles
-- Ejecutar DESPUÉS de 011_candidate_notes.sql
--
-- PROBLEMA QUE RESUELVE:
-- El middleware companyAuth y el CRUD de reclutadores (FASE 2) asumen
-- profiles.suspended y profiles.last_login, que nunca se crearon. Sin estas
-- columnas la consulta del middleware falla y TODAS las rutas autenticadas
-- devuelven 401.

-- 1. Soft-delete / suspensión de reclutadores
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

-- 2. Último acceso (lo muestra el panel de reclutadores)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- 3. Índice para listar reclutadores activos por empresa
CREATE INDEX IF NOT EXISTS idx_profiles_company_role
  ON public.profiles(company_id, role);

-- Verificación
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
