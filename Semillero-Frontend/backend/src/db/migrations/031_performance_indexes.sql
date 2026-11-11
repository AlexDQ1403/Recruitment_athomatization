-- MIGRACIÓN 031: Índices para las consultas más frecuentes
-- Ejecutar DESPUÉS de 030_external_applications.sql
--
-- Solo índices (no cambia datos ni permisos). Cubren filtro + orden de las
-- pantallas que más se cargan, para que Postgres no ordene la tabla completa:
--   - Tabla de candidatos: company_id + created_at DESC (paginada)
--   - Kanban de candidatos: company_id + updated_at DESC
--   - Postulantes de una vacante: applications.vacancy_id
--   - Historial del chat: chat_messages por sesión en orden
--   - Historial de búsquedas: search_history por usuario, lo más reciente primero

CREATE INDEX IF NOT EXISTS idx_candidates_company_created
  ON public.candidates(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidates_company_updated
  ON public.candidates(company_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_vacancy
  ON public.applications(vacancy_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON public.chat_messages(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_search_history_user_created
  ON public.search_history(user_id, created_at DESC);

-- Verificación
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname IN (
  'idx_candidates_company_created',
  'idx_candidates_company_updated',
  'idx_applications_vacancy',
  'idx_chat_messages_session_created',
  'idx_search_history_user_created'
)
ORDER BY tablename, indexname;
