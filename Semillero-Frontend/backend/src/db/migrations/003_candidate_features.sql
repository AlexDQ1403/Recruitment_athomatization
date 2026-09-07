-- Migration: 003_candidate_features
-- Notas por candidato, historial de etapas, y storage de CVs

-- Notas por candidato
CREATE TABLE IF NOT EXISTS public.candidate_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.candidate_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden leer notas"
  ON public.candidate_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados pueden crear notas"
  ON public.candidate_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Autor puede actualizar sus notas"
  ON public.candidate_notes FOR UPDATE TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Autor y superAdmin pueden eliminar notas"
  ON public.candidate_notes FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superAdmin')
  );

CREATE INDEX IF NOT EXISTS idx_candidate_notes_candidate ON public.candidate_notes(candidate_id, created_at DESC);

-- Historial de cambios de etapa (audit trail)
CREATE TABLE IF NOT EXISTS public.candidate_status_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  from_status  TEXT CHECK (from_status IN ('pending','interviewed','hired','rejected')),
  to_status    TEXT NOT NULL CHECK (to_status IN ('pending','interviewed','hired','rejected')),
  changed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.candidate_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden leer historial"
  ON public.candidate_status_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados pueden insertar historial"
  ON public.candidate_status_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_status_history_candidate ON public.candidate_status_history(candidate_id, changed_at DESC);

-- Trigger updated_at para notas
CREATE TRIGGER trg_candidate_notes_updated_at
  BEFORE UPDATE ON public.candidate_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
