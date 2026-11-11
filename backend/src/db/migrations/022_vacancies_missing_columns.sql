-- MIGRACIÓN 022: columnas de vacancies que faltaban en la base real
-- Ejecutar DESPUÉS de 021_candidates_dedupe_indexes.sql
--
-- PROBLEMA QUE RESUELVE:
-- La tabla vacancies de la base real se creó con una versión anterior de la
-- migración 005 y no tiene salary_min, salary_max, experience_years_min ni skills
-- (CREATE TABLE IF NOT EXISTS de la 005 no las añade si la tabla ya existía).
-- Efecto: publicar una vacante fallaba con
--   PGRST204 "Could not find the 'experience_years_min' column of 'vacancies'"
-- y el catálogo de vacantes del candidato (GET /api/me/vacancies) también, porque
-- pide esas mismas columnas.
--
-- Es idempotente: si alguna columna ya existe, no hace nada con ella. No modifica
-- ni borra filas.

ALTER TABLE public.vacancies
  ADD COLUMN IF NOT EXISTS salary_min           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS salary_max           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS experience_years_min INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skills               TEXT[] DEFAULT '{}';

-- PostgREST guarda el esquema en caché: sin esto sigue diciendo que la columna
-- no existe hasta que se reinicie. Esta señal lo recarga al instante.
NOTIFY pgrst, 'reload schema';

-- Verificación: deben aparecer las 4 columnas nuevas junto a las que ya existían
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vacancies'
ORDER BY ordinal_position;
