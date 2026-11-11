'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, EducationEntry, EducationInput } from '../../services/candidatePortalService';
import { useToast } from '../../hooks/useToast';

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });

const emptyForm: EducationInput = { institution: '', degree: '', start_date: null, end_date: null };

export const CandidateEducationSection = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<EducationInput>(emptyForm);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['my-education'],
    queryFn: () => candidatePortalService.listEducation(),
  });

  const addMutation = useMutation({
    mutationFn: (input: EducationInput) => candidatePortalService.addEducation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-education'] });
      setAdding(false);
      setForm(emptyForm);
      toast.success('Formación agregada');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidatePortalService.deleteEducation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-education'] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al eliminar'),
  });

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Formación académica</h2>
        {!adding && (
          <button type="button" className="btn-secondary-sm" onClick={() => setAdding(true)}>+ Agregar</button>
        )}
      </div>

      {isLoading && <div className="skeleton" style={{ height: 40 }} />}

      {!isLoading && items.length === 0 && !adding && (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Aún no has agregado formación académica.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: adding ? 14 : 0 }}>
        {items.map((item) => (
          <div key={item.id} style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10,
          }}>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{item.degree}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{item.institution}</p>
              {(item.start_date || item.end_date) && (
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                  {item.start_date ? fmtDate(item.start_date) : '—'} — {item.end_date ? fmtDate(item.end_date) : 'Actualidad'}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-danger-sm"
              style={{ width: 22, height: 22, fontSize: 13, flexShrink: 0 }}
              onClick={() => deleteMutation.mutate(item.id)}
              disabled={deleteMutation.isPending}
              aria-label="Eliminar"
            >×</button>
          </div>
        ))}
      </div>

      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Institución *</label>
              <input value={form.institution} onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Título *</label>
              <input value={form.degree} onChange={(e) => setForm((f) => ({ ...f, degree: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Fecha inicio</label>
              <input type="date" value={form.start_date ?? ''} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value || null }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Fecha fin</label>
              <input type="date" value={form.end_date ?? ''} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value || null }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 0, padding: '8px' }}
              disabled={!form.institution.trim() || !form.degree.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate(form)}
            >
              {addMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setForm(emptyForm); }}
              style={{ padding: '8px 16px', borderRadius: 'var(--radius)', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
