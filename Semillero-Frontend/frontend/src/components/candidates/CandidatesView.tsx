'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CandidateTable } from './CandidateTable';
import { CandidatePanel } from './CandidatePanel';
import { KanbanBoard } from './KanbanBoard';
import { candidateService, CreateCandidateInput } from '../../services/candidateService';
import { Candidate } from '../../types';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';

type ViewMode = 'table' | 'kanban';

export const CandidatesView = () => {
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const queryClient = useQueryClient();
  const toast = useToast();

  const createMutation = useMutation({
    mutationFn: (data: CreateCandidateInput) => candidateService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidates-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
      setShowForm(false);
      toast.success('Candidato creado exitosamente');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al crear candidato'),
  });

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />

      <div>
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1>Candidatos</h1>
            <p>Gestiona el pipeline de reclutamiento</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Toggle tabla / kanban */}
            <div style={{
              display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 3, gap: 2,
            }}>
              {(['table', 'kanban'] as ViewMode[]).map((mode) => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{
                  padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                  background: viewMode === mode ? 'var(--accent)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'var(--text-3)',
                  transition: 'background 150ms',
                }}>
                  {mode === 'table' ? '≡ Tabla' : '⬜ Kanban'}
                </button>
              ))}
            </div>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setShowForm(true)}>
              + Nuevo candidato
            </button>
          </div>
        </div>

        {/* Modal: nuevo candidato */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Nuevo candidato</h3>
                <button onClick={() => setShowForm(false)} className="modal-close">×</button>
              </div>
              <CandidateForm
                onSubmit={(data) => createMutation.mutate(data)}
                loading={createMutation.isPending}
                error={createMutation.error?.message ?? null}
              />
            </div>
          </div>
        )}

        {/* Modal: detalle + notas + historial */}
        {selected && (
          <div className="modal-overlay" onClick={() => setSelected(null)}>
            <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{selected.full_name}</h3>
                <button onClick={() => setSelected(null)} className="modal-close">×</button>
              </div>
              <CandidatePanel
                candidate={selected}
                onClose={() => setSelected(null)}
                onUpdate={(updated) => setSelected(updated)}
              />
            </div>
          </div>
        )}

        {viewMode === 'table'
          ? <CandidateTable onSelect={setSelected} />
          : <KanbanBoard onSelect={setSelected} />
        }
      </div>
    </>
  );
};

const CandidateForm = ({ onSubmit, loading, error }: {
  onSubmit: (d: CreateCandidateInput) => void;
  loading: boolean;
  error: string | null;
}) => {
  const [form, setForm] = useState<CreateCandidateInput>({
    full_name: '', email: '', phone: '', position: '',
    experience_years: undefined, expected_salary: undefined, location: '',
  });

  const set = (k: keyof CreateCandidateInput) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value || undefined }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="form-error">{error}</div>}
      <div className="form-group">
        <label>Nombre completo *</label>
        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Juan Pérez" required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email ?? ''} onChange={set('email')} placeholder="juan@email.com" />
        </div>
        <div className="form-group">
          <label>Teléfono</label>
          <input value={form.phone ?? ''} onChange={set('phone')} placeholder="+57 300 000 0000" />
        </div>
      </div>
      <div className="form-group">
        <label>Cargo / Perfil *</label>
        <input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="Desarrollador Frontend" required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label>Experiencia (años)</label>
          <input type="number" min={0} value={form.experience_years ?? ''} onChange={(e) => setForm((f) => ({ ...f, experience_years: e.target.value ? Number(e.target.value) : undefined }))} placeholder="3" />
        </div>
        <div className="form-group">
          <label>Salario esperado (COP)</label>
          <input type="number" min={0} value={form.expected_salary ?? ''} onChange={(e) => setForm((f) => ({ ...f, expected_salary: e.target.value ? Number(e.target.value) : undefined }))} placeholder="3500000" />
        </div>
      </div>
      <div className="form-group">
        <label>Ubicación</label>
        <input value={form.location ?? ''} onChange={set('location')} placeholder="Bogotá, Colombia" />
      </div>
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Guardando...' : 'Crear candidato'}
      </button>
    </form>
  );
};
