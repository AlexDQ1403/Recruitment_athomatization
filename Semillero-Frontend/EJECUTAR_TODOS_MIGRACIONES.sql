-- ============================================================================
-- EJECUTAR TODAS LAS MIGRACIONES EN ORDEN
-- ============================================================================
-- Si algunas tablas ya existen, esto no fallará (usa IF NOT EXISTS)

-- ============================================================================
-- MIGRACIÓN 1: Schema básico (si no existe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'recruiter',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_read" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================================
-- MIGRACIÓN 2: Tabla candidates (si no existe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  position TEXT,
  email TEXT,
  phone TEXT,
  experience_years INTEGER,
  expected_salary INTEGER,
  location TEXT,
  status TEXT DEFAULT 'seguimiento' CHECK (status IN ('seguimiento', 'rechazado', 'contratacion', 'Pendiente', 'Entrevistado', 'Contratado', 'Rechazado', 'pending', 'interviewed', 'hired', 'rejected')),
  source TEXT CHECK (source IN ('Interno', 'Web scraping', 'Aplicante', 'internal', 'scraping', 'applicant')),
  resume_url TEXT,
  profile_url TEXT,
  linkedin_url TEXT,
  vacancy_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidates_status_idx ON candidates(status);
CREATE INDEX IF NOT EXISTS candidates_source_idx ON candidates(source);

-- ============================================================================
-- MIGRACIÓN 3: Tablas de chat (si no existen)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  candidates JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_history_user_idx ON chat_history(user_id);

-- ============================================================================
-- MIGRACIÓN 4: Historial de búsquedas (si no existe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  candidates_found INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_history_user_idx ON search_history(user_id);

-- ============================================================================
-- MIGRACIÓN 5: Tabla vacancies (si no existe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company TEXT,
  description TEXT,
  location TEXT,
  modality TEXT CHECK (modality IN ('Presencial', 'Remoto', 'Híbrido', 'on-site', 'remote', 'hybrid')),
  min_experience INTEGER,
  max_salary INTEGER,
  min_salary INTEGER,
  deadline DATE,
  status TEXT DEFAULT 'Activa' CHECK (status IN ('Activa', 'Pausada', 'Cerrada', 'active', 'paused', 'closed')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacancies_status_idx ON vacancies(status);

-- ============================================================================
-- AHORA SÍ: FASE 0 - Jerarquía Empresa → Reclutador
-- ============================================================================

-- 1. Crear tabla companies
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  industry TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_read" ON companies;
CREATE POLICY "companies_read" ON companies
  FOR SELECT USING (true);

-- 2. Agregar company_id a profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS profiles_company_idx ON profiles(company_id);

-- 3. Agregar columnas a candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS n8n_request_id TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS n8n_search_date TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS candidates_company_idx ON candidates(company_id);
CREATE INDEX IF NOT EXISTS candidates_email_idx ON candidates(email);
CREATE INDEX IF NOT EXISTS candidates_linkedin_idx ON candidates(linkedin_url);

-- 4. Actualizar estados a los nuevos
UPDATE public.candidates SET status = 'seguimiento' WHERE status IN ('Pendiente', 'pending', 'Entrevistado', 'interviewed');
UPDATE public.candidates SET status = 'contratacion' WHERE status IN ('Contratado', 'hired');
UPDATE public.candidates SET status = 'rechazado' WHERE status IN ('Rechazado', 'rejected');

-- 5. Crear constraint nuevo de status
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.candidates DROP CONSTRAINT candidates_status_check;
  EXCEPTION WHEN UNDEFINED_OBJECT THEN
    NULL;
  END;
END $$;

ALTER TABLE public.candidates ADD CONSTRAINT candidates_status_check
  CHECK (status IN ('seguimiento', 'rechazado', 'contratacion'));

-- 6. Habilitar RLS en candidates
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_read_own_company" ON candidates;
DROP POLICY IF EXISTS "candidates_insert_own_company" ON candidates;
DROP POLICY IF EXISTS "candidates_update_own_company" ON candidates;
DROP POLICY IF EXISTS "candidates_delete_own_company" ON candidates;

CREATE POLICY "candidates_read_own_company" ON candidates
  FOR SELECT
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "candidates_insert_own_company" ON candidates
  FOR INSERT
  WITH CHECK (
    company_id = (
      SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "candidates_update_own_company" ON candidates
  FOR UPDATE
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "candidates_delete_own_company" ON candidates
  FOR DELETE
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

-- 7. Crear tabla chat_sessions
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Sesión sin nombre',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_sessions_user_idx ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS chat_sessions_company_idx ON chat_sessions(company_id);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

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

-- 8. Crear tabla chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  candidates JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_read_own" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert_own" ON chat_messages;

CREATE POLICY "chat_messages_read_own" ON chat_messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert_own" ON chat_messages
  FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()
    )
  );

-- 9. Actualizar tabla search_history con company_id
ALTER TABLE public.search_history ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_history_read_own_company" ON search_history;
DROP POLICY IF EXISTS "search_history_insert_own_company" ON search_history;

CREATE POLICY "search_history_read_own_company" ON search_history
  FOR SELECT
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "search_history_insert_own_company" ON search_history
  FOR INSERT
  WITH CHECK (
    company_id = (
      SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

-- ============================================================================
-- FIN: Todas las migraciones ejecutadas
-- ============================================================================
-- Si todo está bien, deberías ver: "Success. No rows returned"
