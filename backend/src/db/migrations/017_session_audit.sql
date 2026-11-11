-- MIGRACIÓN 017: Auditoría de inicio y cierre de sesión
-- Ejecutar DESPUÉS de 016_vacancies_and_applications.sql
--
-- PROBLEMA QUE RESUELVE:
-- 1. recruiter_audit_log admite la acción 'login' pero no 'logout', así que el
--    cierre de sesión no se puede registrar.
-- 2. profiles.last_login (migración 012) se muestra en el panel de reclutadores
--    pero nunca se escribe: la columna siempre está en NULL y la UI dice
--    "Nunca" para todos.

-- 1. Admitir el registro de cierre de sesión
ALTER TABLE public.recruiter_audit_log DROP CONSTRAINT IF EXISTS recruiter_audit_log_action_check;
ALTER TABLE public.recruiter_audit_log ADD CONSTRAINT recruiter_audit_log_action_check
  CHECK (action IN ('created', 'updated', 'suspended', 'deleted', 'login', 'logout'));

-- 2. Consultar la actividad reciente de sesión por empresa
CREATE INDEX IF NOT EXISTS idx_recruiter_audit_session
  ON public.recruiter_audit_log(company_id, action, changed_at DESC);

-- Verificación
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'recruiter_audit_log_action_check';
