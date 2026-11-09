-- MIGRACIÓN 023: alinear las restricciones CHECK de vacancies con las de la aplicación
-- Ejecutar DESPUÉS de 022_vacancies_missing_columns.sql
--
-- PROBLEMA QUE RESUELVE:
-- Tras añadir las columnas faltantes (022), publicar una vacante seguía fallando:
--   23514 new row for relation "vacancies" violates check constraint "vacancies_modality_check"
-- La tabla real se creó con una versión anterior de la migración 005 y su restricción
-- de modalidad acepta otros valores que los que envía el formulario
-- ('presencial', 'remoto', 'híbrido'). La de status puede tener el mismo desfase.
--
-- SEGURIDAD: se comprobó que la tabla no tiene filas (0), así que reemplazar las
-- restricciones no puede dejar datos inválidos. Por si más adelante se reejecuta con
-- datos, primero se normalizan los valores en inglés más comunes y las restricciones
-- se crean NOT VALID: se aplican a todo lo nuevo sin bloquear por filas antiguas.
--
-- Es idempotente.

-- 1. Normalizar valores antiguos conocidos (no hace nada si no hay filas)
UPDATE public.vacancies SET modality = 'presencial' WHERE lower(modality) IN ('onsite', 'on-site', 'on_site', 'presential', 'in_person', 'in-person');
UPDATE public.vacancies SET modality = 'remoto'     WHERE lower(modality) IN ('remote');
UPDATE public.vacancies SET modality = 'híbrido'    WHERE lower(modality) IN ('hybrid', 'hibrido');
UPDATE public.vacancies SET status   = 'active'     WHERE lower(status)   IN ('open', 'published', 'activa');
UPDATE public.vacancies SET status   = 'paused'     WHERE lower(status)   IN ('pausada', 'draft');
UPDATE public.vacancies SET status   = 'closed'     WHERE lower(status)   IN ('cerrada', 'archived');

-- 2. Restricciones definitivas (las de la migración 005)
ALTER TABLE public.vacancies DROP CONSTRAINT IF EXISTS vacancies_modality_check;
ALTER TABLE public.vacancies ADD CONSTRAINT vacancies_modality_check
  CHECK (modality IN ('presencial', 'remoto', 'híbrido')) NOT VALID;

ALTER TABLE public.vacancies DROP CONSTRAINT IF EXISTS vacancies_status_check;
ALTER TABLE public.vacancies ADD CONSTRAINT vacancies_status_check
  CHECK (status IN ('active', 'paused', 'closed')) NOT VALID;

-- 3. Refrescar la caché de esquema de PostgREST
NOTIFY pgrst, 'reload schema';

-- Verificación: debe listar las dos restricciones con los valores de arriba
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.vacancies'::regclass AND contype = 'c'
ORDER BY conname;
