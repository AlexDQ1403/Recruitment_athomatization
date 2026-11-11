-- Migration: 005_vacancies
-- Sistema de vacantes: empresas abren posiciones, candidatos aplican a vacantes específicas

-- Vacantes
CREATE TABLE IF NOT EXISTS public.vacancies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  company       TEXT NOT NULL,
  description   TEXT,
  location      TEXT,
  modality      TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial','remoto','híbrido')),
  salary_min    NUMERIC(12,2),
  salary_max    NUMERIC(12,2),
  experience_years_min INT DEFAULT 0,
  skills        TEXT[],
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deadline      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vacancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen vacantes"
  ON public.vacancies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Reclutadores crean vacantes"
  ON public.vacancies FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Reclutadores actualizan vacantes"
  ON public.vacancies FOR UPDATE TO authenticated USING (true);

CREATE POLICY "SuperAdmin elimina vacantes"
  ON public.vacancies FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superAdmin'));

-- Lectura pública para el portal /apply (anon puede ver vacantes activas)
CREATE POLICY "Público lee vacantes activas"
  ON public.vacancies FOR SELECT TO anon
  USING (status = 'active');

-- Vincular candidatos a vacantes (una aplicación = un candidato en una vacante)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS vacancy_id UUID REFERENCES public.vacancies(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_vacancies_status   ON public.vacancies(status);
CREATE INDEX IF NOT EXISTS idx_vacancies_created_by ON public.vacancies(created_by);
CREATE INDEX IF NOT EXISTS idx_candidates_vacancy  ON public.candidates(vacancy_id);

-- Trigger updated_at
CREATE TRIGGER trg_vacancies_updated_at
  BEFORE UPDATE ON public.vacancies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
