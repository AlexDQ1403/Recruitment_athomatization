-- MIGRACIÓN 009: Agregar tablas de auditoría
-- Ejecutar DESPUÉS de 008_fix_candidate_status_enum.sql
-- Propósito: Registrar cambios de recruiters y estados de candidatos

-- 1. Tabla de auditoría de recruiters
CREATE TABLE IF NOT EXISTS recruiter_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('created', 'updated', 'suspended', 'deleted', 'login')),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changes JSONB,
  ip_address TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX recruiter_audit_log_company_idx ON recruiter_audit_log(company_id);
CREATE INDEX recruiter_audit_log_recruiter_idx ON recruiter_audit_log(recruiter_id);
CREATE INDEX recruiter_audit_log_changed_at_idx ON recruiter_audit_log(changed_at);

-- 2. Tabla de auditoría de cambios de candidato
CREATE TABLE IF NOT EXISTS candidate_status_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX candidate_status_audit_candidate_idx ON candidate_status_audit(candidate_id);
CREATE INDEX candidate_status_audit_changed_at_idx ON candidate_status_audit(changed_at);

-- 3. RLS para audit tables
ALTER TABLE recruiter_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_status_audit ENABLE ROW LEVEL SECURITY;

-- Política: Empresa solo ve auditoría de su propia empresa
CREATE POLICY "recruiter_audit_read_own_company" ON recruiter_audit_log
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Política: Usuario solo ve auditoría de candidatos de su empresa
CREATE POLICY "candidate_audit_read_own_company" ON candidate_status_audit
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM candidates
      WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );
