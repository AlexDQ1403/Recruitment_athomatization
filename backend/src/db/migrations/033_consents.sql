-- MIGRACIÓN 033: prueba de la autorización de tratamiento de datos
--
-- La Ley 1581 de 2012 (art. 9) y el Decreto 1377 de 2013 (art. 7-8) exigen que la
-- autorización sea previa, expresa e informada y que el responsable pueda probarla.
-- Cada fila es una aceptación: quién, qué documento, qué versión, cuándo y desde dónde.
-- Solo escribe el backend (service role): RLS activo y sin políticas.

CREATE TABLE IF NOT EXISTS public.consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document    text NOT NULL CHECK (document IN ('privacy', 'terms')),
  version     text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text
);

-- Una aceptación por persona, documento y versión
CREATE UNIQUE INDEX IF NOT EXISTS consents_user_document_version
  ON public.consents (user_id, document, version);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
