-- 031: índices para las consultas más frecuentes

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
