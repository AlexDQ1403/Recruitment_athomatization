-- 022: columnas de vacancies que faltaban en la base real

ALTER TABLE public.vacancies
  ADD COLUMN IF NOT EXISTS salary_min           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS salary_max           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS experience_years_min INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skills               TEXT[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
