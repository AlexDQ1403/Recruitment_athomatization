-- 010: asegurar candidate_status_history con el modelo de 3 estados

CREATE TABLE IF NOT EXISTS public.candidate_status_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  changed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason       TEXT,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.candidate_status_history ADD COLUMN IF NOT EXISTS reason TEXT;

UPDATE public.candidate_status_history SET from_status = 'seguimiento'
WHERE from_status IN ('pending', 'interviewed', 'hired');
UPDATE public.candidate_status_history SET from_status = 'rechazado'
WHERE from_status = 'rejected';

UPDATE public.candidate_status_history SET to_status = 'seguimiento'
WHERE to_status IN ('pending', 'interviewed', 'hired');
UPDATE public.candidate_status_history SET to_status = 'rechazado'
WHERE to_status = 'rejected';

ALTER TABLE public.candidate_status_history
  DROP CONSTRAINT IF EXISTS candidate_status_history_from_status_check;
ALTER TABLE public.candidate_status_history
  DROP CONSTRAINT IF EXISTS candidate_status_history_to_status_check;

ALTER TABLE public.candidate_status_history ADD CONSTRAINT candidate_status_history_from_status_check
  CHECK (from_status IS NULL OR from_status IN ('rechazado', 'en_contacto', 'seguimiento'));

ALTER TABLE public.candidate_status_history ADD CONSTRAINT candidate_status_history_to_status_check
  CHECK (to_status IN ('rechazado', 'en_contacto', 'seguimiento'));

CREATE INDEX IF NOT EXISTS idx_status_history_candidate
  ON public.candidate_status_history(candidate_id, changed_at DESC);

ALTER TABLE public.candidate_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_history_select" ON public.candidate_status_history;
DROP POLICY IF EXISTS "status_history_insert" ON public.candidate_status_history;
DROP POLICY IF EXISTS "Lectura historial" ON public.candidate_status_history;
DROP POLICY IF EXISTS "Insercion historial" ON public.candidate_status_history;

CREATE POLICY "status_history_read_own_company" ON public.candidate_status_history
  FOR SELECT TO authenticated USING (
    candidate_id IN (
      SELECT id FROM public.candidates
      WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'candidate_status_audit') THEN
    COMMENT ON TABLE public.candidate_status_audit IS
      'DEPRECADA desde migración 010. Usar candidate_status_history.';
  END IF;
END $$;
