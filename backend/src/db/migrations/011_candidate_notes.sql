-- 011: crear candidate_notes (faltante de 003)

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.candidate_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_notes_candidate
  ON public.candidate_notes(candidate_id, created_at DESC);

ALTER TABLE public.candidate_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados pueden leer notas" ON public.candidate_notes;
DROP POLICY IF EXISTS "Autenticados pueden crear notas" ON public.candidate_notes;
DROP POLICY IF EXISTS "Autor puede actualizar sus notas" ON public.candidate_notes;
DROP POLICY IF EXISTS "Autor y superAdmin pueden eliminar notas" ON public.candidate_notes;
DROP POLICY IF EXISTS "notes_read_own_company" ON public.candidate_notes;
DROP POLICY IF EXISTS "notes_insert_own_company" ON public.candidate_notes;
DROP POLICY IF EXISTS "notes_update_own" ON public.candidate_notes;
DROP POLICY IF EXISTS "notes_delete_own" ON public.candidate_notes;

CREATE POLICY "notes_read_own_company" ON public.candidate_notes
  FOR SELECT TO authenticated USING (
    candidate_id IN (
      SELECT id FROM public.candidates
      WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "notes_insert_own_company" ON public.candidate_notes
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = author_id
    AND candidate_id IN (
      SELECT id FROM public.candidates
      WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "notes_update_own" ON public.candidate_notes
  FOR UPDATE TO authenticated USING (auth.uid() = author_id);

CREATE POLICY "notes_delete_own" ON public.candidate_notes
  FOR DELETE TO authenticated USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('empresa', 'superAdmin')
    )
  );

DROP TRIGGER IF EXISTS trg_candidate_notes_updated_at ON public.candidate_notes;
CREATE TRIGGER trg_candidate_notes_updated_at
  BEFORE UPDATE ON public.candidate_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
