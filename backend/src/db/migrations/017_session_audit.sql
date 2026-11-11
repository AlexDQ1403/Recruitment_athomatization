-- 017: auditoría de inicio y cierre de sesión

ALTER TABLE public.recruiter_audit_log DROP CONSTRAINT IF EXISTS recruiter_audit_log_action_check;
ALTER TABLE public.recruiter_audit_log ADD CONSTRAINT recruiter_audit_log_action_check
  CHECK (action IN ('created', 'updated', 'suspended', 'deleted', 'login', 'logout'));

CREATE INDEX IF NOT EXISTS idx_recruiter_audit_session
  ON public.recruiter_audit_log(company_id, action, changed_at DESC);
