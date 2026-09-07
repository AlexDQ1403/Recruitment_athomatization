-- FASE 0: Jerarquía Empresa → Reclutador
-- Ejecutar en Supabase SQL Editor
-- IMPORTANTE: Ejecutar COMPLETO (no por partes)

-- ============================================================================
-- 1. CREAR TABLA: companies (Empresas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  industry TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_read" ON companies
  FOR SELECT USING (true);

-- ============================================================================
-- 2. AGREGAR COLUMNA: profiles.company_id
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS profiles_company_idx ON profiles(company_id);

-- ============================================================================
-- 3. MODIFICAR TABLA: candidates (agregar columnas nuevas)
-- ============================================================================
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS n8n_request_id TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS n8n_search_date TIMESTAMP WITH TIME ZONE;

-- Crear índices para queries rápidas
CREATE INDEX IF NOT EXISTS candidates_company_idx ON candidates(company_id);
CREATE INDEX IF NOT EXISTS candidates_email_idx ON candidates(email);
CREATE INDEX IF NOT EXISTS candidates_linkedin_idx ON candidates(linkedin_url);
CREATE INDEX IF NOT EXISTS candidates_status_idx ON candidates(status);
CREATE INDEX IF NOT EXISTS candidates_source_idx ON candidates(source);

-- ============================================================================
-- 4. ACTUALIZAR CONSTRAINT DE STATUS
-- ============================================================================
-- Primero, actualizar datos existentes a los nuevos estados
UPDATE candidates SET status = 'seguimiento' WHERE status = 'Pendiente' OR status = 'pending';
UPDATE candidates SET status = 'contratacion' WHERE status = 'Contratado' OR status = 'hired';
UPDATE candidates SET status = 'rechazado' WHERE status = 'Rechazado' OR status = 'rejected';
-- Entrevistado / interviewed → seguimiento
UPDATE candidates SET status = 'seguimiento' WHERE status = 'Entrevistado' OR status = 'interviewed';

-- Luego, ELIMINAR constraint antiguo (si existe)
DO $$
BEGIN
  BEGIN
    ALTER TABLE candidates DROP CONSTRAINT candidates_status_check;
  EXCEPTION WHEN UNDEFINED_OBJECT THEN
    NULL;
  END;
END $$;

-- Finalmente, CREAR constraint nuevo
ALTER TABLE candidates ADD CONSTRAINT candidates_status_check
  CHECK (status IN ('seguimiento', 'rechazado', 'contratacion'));

-- ============================================================================
-- 5. HABILITAR RLS EN candidates
-- ============================================================================
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas antiguas (si existen)
DROP POLICY IF EXISTS "candidates_read" ON candidates;
DROP POLICY IF EXISTS "candidates_insert" ON candidates;
DROP POLICY IF EXISTS "candidates_update" ON candidates;
DROP POLICY IF EXISTS "candidates_delete" ON candidates;

-- Crear nuevas políticas por empresa
CREATE POLICY "candidates_read_own_company" ON candidates
  FOR SELECT
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "candidates_insert_own_company" ON candidates
  FOR INSERT
  WITH CHECK (
    company_id = (
      SELECT company_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "candidates_update_own_company" ON candidates
  FOR UPDATE
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "candidates_delete_own_company" ON candidates
  FOR DELETE
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- ============================================================================
-- 6. CREAR TABLA: chat_sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Sesión sin nombre',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_sessions_user_idx ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS chat_sessions_company_idx ON chat_sessions(company_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_sessions_read_own" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert_own" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update_own" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_delete_own" ON chat_sessions;

CREATE POLICY "chat_sessions_read_own" ON chat_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "chat_sessions_insert_own" ON chat_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_sessions_update_own" ON chat_sessions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "chat_sessions_delete_own" ON chat_sessions
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- 7. CREAR TABLA: chat_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  candidates JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_read_own" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert_own" ON chat_messages;

CREATE POLICY "chat_messages_read_own" ON chat_messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert_own" ON chat_messages
  FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. CREAR TABLA: search_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  candidates_found INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_history_company_idx ON search_history(company_id);
CREATE INDEX IF NOT EXISTS search_history_user_idx ON search_history(user_id);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_history_read_own_company" ON search_history;
DROP POLICY IF EXISTS "search_history_insert_own_company" ON search_history;

CREATE POLICY "search_history_read_own_company" ON search_history
  FOR SELECT
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "search_history_insert_own_company" ON search_history
  FOR INSERT
  WITH CHECK (
    company_id = (
      SELECT company_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- ============================================================================
-- 9. AGREGAR COLUMNA: profiles.role (si no existe)
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'recruiter';

-- Agregar constraint si no existe (usando DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='profiles' AND constraint_name='profiles_role_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('empresa', 'recruiter', 'superAdmin'));
  END IF;
END $$;

-- ============================================================================
-- FIN FASE 0 - ESTRUCTURA COMPLETA
-- ============================================================================
-- Verificar que todo esté creado:
-- SELECT * FROM companies; (debería estar vacía)
-- SELECT * FROM chat_sessions; (debería estar vacía)
-- SELECT * FROM chat_messages; (debería estar vacía)
-- SELECT * FROM search_history; (debería estar vacía)
