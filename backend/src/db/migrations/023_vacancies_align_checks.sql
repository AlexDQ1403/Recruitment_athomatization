-- 023: alinear las restricciones CHECK de vacancies con las de la aplicación

UPDATE public.vacancies SET modality = 'presencial' WHERE lower(modality) IN ('onsite', 'on-site', 'on_site', 'presential', 'in_person', 'in-person');
UPDATE public.vacancies SET modality = 'remoto'     WHERE lower(modality) IN ('remote');
UPDATE public.vacancies SET modality = 'híbrido'    WHERE lower(modality) IN ('hybrid', 'hibrido');
UPDATE public.vacancies SET status   = 'active'     WHERE lower(status)   IN ('open', 'published', 'activa');
UPDATE public.vacancies SET status   = 'paused'     WHERE lower(status)   IN ('pausada', 'draft');
UPDATE public.vacancies SET status   = 'closed'     WHERE lower(status)   IN ('cerrada', 'archived');

ALTER TABLE public.vacancies DROP CONSTRAINT IF EXISTS vacancies_modality_check;
ALTER TABLE public.vacancies ADD CONSTRAINT vacancies_modality_check
  CHECK (modality IN ('presencial', 'remoto', 'híbrido')) NOT VALID;

ALTER TABLE public.vacancies DROP CONSTRAINT IF EXISTS vacancies_status_check;
ALTER TABLE public.vacancies ADD CONSTRAINT vacancies_status_check
  CHECK (status IN ('active', 'paused', 'closed')) NOT VALID;

NOTIFY pgrst, 'reload schema';
