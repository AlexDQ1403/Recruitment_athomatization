'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, SearchPreferences } from '../../services/candidatePortalService';
import { useToast } from '../../hooks/useToast';

const MODALITIES: { value: SearchPreferences['modality']; label: string }[] = [
  { value: null, label: 'Sin preferencia' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'remoto', label: 'Remoto' },
  { value: 'híbrido', label: 'Híbrido' },
];

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: values.length > 0 ? 8 : 0 }}>
        {values.map((v) => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999,
            padding: '4px 6px 4px 12px', color: 'var(--text-1)',
          }}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}
              style={{ width: 16, height: 16, borderRadius: '50%', fontSize: 11, color: 'var(--text-3)', lineHeight: 1 }}
              aria-label={`Quitar ${v}`}
            >×</button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
      />
    </div>
  );
}

/**
 * Lo que usa el chat de reclutadores para encontrar al candidato — separado a
 * propósito de la hoja de vida (ver backend/src/routes/chat.ts). Subir un CV
 * nunca rellena esto automáticamente.
 */
export const CandidateSearchPreferencesSection = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<SearchPreferences | null>(null);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['my-search-preferences'],
    queryFn: () => candidatePortalService.getSearchPreferences(),
  });

  useEffect(() => {
    if (prefs && !form) setForm(prefs);
  }, [prefs, form]);

  const saveMutation = useMutation({
    mutationFn: (input: SearchPreferences) => candidatePortalService.updateSearchPreferences(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(['my-search-preferences'], updated);
      toast.success('Preferencias de búsqueda guardadas');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  if (isLoading || !form) return <div className="skeleton" style={{ height: 40 }} />;

  return (
    <section>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Perfil de búsqueda</h2>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
        Esto es lo que usan los reclutadores para encontrarte cuando buscan candidatos — distinto de tu hoja de vida.
      </p>

      <div className="form-group">
        <label>Cargo objetivo</label>
        <input
          value={form.target_position ?? ''}
          onChange={(e) => setForm((f) => f && { ...f, target_position: e.target.value || null })}
          placeholder="Ej: Desarrollador Frontend Senior"
          maxLength={160}
        />
      </div>

      <div className="form-group">
        <label>Tecnologías</label>
        <TagInput values={form.technologies} onChange={(v) => setForm((f) => f && { ...f, technologies: v })} placeholder="React, Node.js, PostgreSQL... (Enter para agregar)" />
      </div>

      <div className="form-group">
        <label>Sectores de interés</label>
        <TagInput values={form.sectors} onChange={(v) => setForm((f) => f && { ...f, sectors: v })} placeholder="Fintech, Salud, Educación... (Enter para agregar)" />
      </div>

      <div className="form-group">
        <label>Palabras clave</label>
        <TagInput values={form.keywords} onChange={(v) => setForm((f) => f && { ...f, keywords: v })} placeholder="Otras palabras que te describan (Enter para agregar)" />
      </div>

      <div className="form-group">
        <label>Modalidad de trabajo</label>
        <select
          value={form.modality ?? ''}
          onChange={(e) => setForm((f) => f && { ...f, modality: (e.target.value || null) as SearchPreferences['modality'] })}
        >
          {MODALITIES.map((m) => <option key={m.label} value={m.value ?? ''}>{m.label}</option>)}
        </select>
      </div>

      <button
        type="button"
        className="btn-primary"
        disabled={saveMutation.isPending}
        onClick={() => form && saveMutation.mutate(form)}
      >
        {saveMutation.isPending ? 'Guardando...' : 'Guardar preferencias'}
      </button>
    </section>
  );
};
