'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vacancyService, CreateVacancyInput } from '../../services/vacancyService';
import { Vacancy, VacancyStatus } from '../../types';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';
import Link from 'next/link';

const STATUS_LABELS: Record<VacancyStatus, string> = {
  active: 'Activa', paused: 'Pausada', closed: 'Cerrada',
};
const STATUS_COLORS: Record<VacancyStatus, string> = {
  active: 'badge-hired', paused: 'badge-pending', closed: 'badge-rejected',
};
const MODALITY_LABELS = { presencial: 'Presencial', remoto: 'Remoto', 'híbrido': 'Híbrido' };

const fmt = (n?: number) => n !== undefined ? `$${n.toLocaleString('es-CO')}` : '';
const fmtRange = (min?: number, max?: number) => {
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `Desde ${fmt(min)}`;
  if (max) return `Hasta ${fmt(max)}`;
  return '—';
};

export const VacanciesView = () => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vacancy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vacancy | null>(null);
  const [statusFilter, setStatusFilter] = useState<VacancyStatus | ''>('active');
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['vacancies', statusFilter],
    queryFn: () => vacancyService.list(1, 50, statusFilter || undefined),
  });

  const createMutation = useMutation({
    mutationFn: (d: CreateVacancyInput) => vacancyService.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      setShowForm(false);
      toast.success('Vacante creada');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al crear'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateVacancyInput & { status: VacancyStatus }> }) =>
      vacancyService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      setEditing(null);
      toast.success('Vacante actualizada');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vacancyService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      toast.success('Vacante eliminada');
    },
    onError: () => toast.error('Error al eliminar'),
  });

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/apply/${id}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar la vacante "${deleteTarget.title}"? Los candidatos asociados no se eliminarán.`}
          confirmLabel="Eliminar"
          onConfirm={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {(showForm || editing) && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Editar vacante' : 'Nueva vacante'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="modal-close">×</button>
            </div>
            <VacancyForm
              initial={editing ?? undefined}
              onSubmit={(d) => editing
                ? updateMutation.mutate({ id: editing.id, data: d })
                : createMutation.mutate(d)
              }
              loading={createMutation.isPending || updateMutation.isPending}
              error={createMutation.error?.message ?? updateMutation.error?.message ?? null}
            />
          </div>
        </div>
      )}

      <div>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Vacantes</h1>
            <p>Gestiona las posiciones abiertas y comparte los links de aplicación</p>
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }}
            onClick={() => setShowForm(true)}>
            + Nueva vacante
          </button>
        </div>

        {/* Filtro de estado */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {([['', 'Todas'], ['active', 'Activas'], ['paused', 'Pausadas'], ['closed', 'Cerradas']] as [VacancyStatus | '', string][]).map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val)} style={{
              padding: '6px 14px', borderRadius: 'var(--radius)', fontSize: 12.5, fontWeight: 500,
              background: statusFilter === val ? 'var(--accent)' : 'var(--surface-2)',
              color: statusFilter === val ? 'var(--text-inv)' : 'var(--text-3)',
              border: `1px solid ${statusFilter === val ? 'var(--accent)' : 'var(--border)'}`,
              transition: 'all 120ms',
            }}>{label}</button>
          ))}
        </div>

        {isError && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--red)' }} role="alert">
            Error al cargar vacantes.
            <button onClick={() => refetch()} style={{ marginLeft: 12, color: 'var(--accent)', fontSize: 13 }}>Reintentar</button>
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 22, height: 180 }}>
                <div className="skeleton" style={{ height: 18, width: '60%', marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 13, width: '40%', marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 13, width: '80%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 13, width: '55%' }} />
              </div>
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-3)' }}>
            <p style={{ fontSize: 32, marginBottom: 10 }}>📋</p>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 4 }}>No hay vacantes{statusFilter ? ` con estado "${STATUS_LABELS[statusFilter as VacancyStatus]}"` : ''}</p>
            <p style={{ fontSize: 12 }}>Crea una vacante para empezar a recibir aplicaciones</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {data?.items.map((v) => (
              <VacancyCard
                key={v.id}
                vacancy={v}
                onEdit={() => setEditing(v)}
                onDelete={() => setDeleteTarget(v)}
                onCopyLink={() => copyLink(v.id)}
                onToggleStatus={() => updateMutation.mutate({
                  id: v.id,
                  data: { status: v.status === 'active' ? 'paused' : 'active' },
                })}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

// ─── Card de vacante ─────────────────────────────────────────────────────────

function VacancyCard({ vacancy: v, onEdit, onDelete, onCopyLink, onToggleStatus }: {
  vacancy: Vacancy;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 22,
      display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'border-color 150ms',
      borderLeft: `3px solid ${v.status === 'active' ? 'var(--green)' : v.status === 'paused' ? 'var(--yellow)' : 'var(--border)'}`,
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text-1)', lineHeight: 1.2 }}>
            {v.title}
          </h3>
          <span className={`badge ${STATUS_COLORS[v.status]}`} style={{ flexShrink: 0, fontSize: 10 }}>
            {STATUS_LABELS[v.status]}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600 }}>{v.company}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {v.location && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {v.location}
          </span>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {MODALITY_LABELS[v.modality]}</span>
        {(v.salary_min || v.salary_max) && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {fmtRange(v.salary_min, v.salary_max)}</span>
        )}
        {v.experience_years_min !== undefined && v.experience_years_min > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {v.experience_years_min}+ años</span>
        )}
      </div>

      {v.skills && v.skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {v.skills.slice(0, 5).map((s) => (
            <span key={s} style={{
              fontSize: 10.5, padding: '2px 8px', borderRadius: 4,
              background: 'var(--surface-3)', border: '1px solid var(--border-2)',
              color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
            }}>{s}</span>
          ))}
          {v.skills.length > 5 && (
            <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>+{v.skills.length - 5}</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            {v.applicants_count ?? 0} aplicantes
          </span>
          {v.deadline && (
            <span style={{ fontSize: 11, color: new Date(v.deadline) < new Date() ? 'var(--red)' : 'var(--text-3)' }}>
              · Cierra {new Date(v.deadline).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={onCopyLink} title="Copiar link de aplicación"
            style={{ padding: '5px 9px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, transition: 'color 120ms' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          </button>
          <Link href={`/candidates?vacancy=${v.id}`} title="Ver candidatos"
            style={{ padding: '5px 9px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12, display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          </Link>
          <button onClick={onToggleStatus} title={v.status === 'active' ? 'Pausar' : 'Activar'}
            style={{ padding: '5px 9px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: v.status === 'active' ? 'var(--yellow)' : 'var(--green)', fontSize: 12 }}>
            {v.status === 'active' ? '⏸' : '▶'}
          </button>
          <button onClick={onEdit} title="Editar"
            style={{ padding: '5px 9px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 12 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={onDelete} className="btn-danger-sm" title="Eliminar">×</button>
        </div>
      </div>
    </div>
  );
}

// ─── Formulario de vacante ───────────────────────────────────────────────────

function VacancyForm({ initial, onSubmit, loading, error }: {
  initial?: Vacancy;
  onSubmit: (d: CreateVacancyInput) => void;
  loading: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<CreateVacancyInput>({
    title: initial?.title ?? '',
    company: initial?.company ?? '',
    description: initial?.description ?? '',
    location: initial?.location ?? '',
    modality: initial?.modality ?? 'presencial',
    salary_min: initial?.salary_min,
    salary_max: initial?.salary_max,
    experience_years_min: initial?.experience_years_min ?? 0,
    skills: initial?.skills ?? [],
    deadline: initial?.deadline ?? '',
  });
  const [skillInput, setSkillInput] = useState('');

  const set = (k: keyof CreateVacancyInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value || undefined }));

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills?.includes(s)) {
      setForm((f) => ({ ...f, skills: [...(f.skills ?? []), s] }));
    }
    setSkillInput('');
  };

  const removeSkill = (s: string) => setForm((f) => ({ ...f, skills: f.skills?.filter((x) => x !== s) }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="form-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Título del cargo *</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Desarrollador Frontend React" required />
        </div>
        <div className="form-group">
          <label>Empresa / Cliente *</label>
          <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="TechCorp S.A." required />
        </div>
        <div className="form-group">
          <label>Modalidad</label>
          <select value={form.modality} onChange={(e) => setForm((f) => ({ ...f, modality: e.target.value as CreateVacancyInput['modality'] }))}>
            <option value="presencial">Presencial</option>
            <option value="remoto">Remoto</option>
            <option value="híbrido">Híbrido</option>
          </select>
        </div>
        <div className="form-group">
          <label>Ciudad / Ubicación</label>
          <input value={form.location ?? ''} onChange={set('location')} placeholder="Bogotá, Colombia" />
        </div>
        <div className="form-group">
          <label>Experiencia mínima (años)</label>
          <input type="number" min={0} value={form.experience_years_min ?? ''} onChange={(e) => setForm((f) => ({ ...f, experience_years_min: e.target.value ? Number(e.target.value) : 0 }))} placeholder="2" />
        </div>
        <div className="form-group">
          <label>Salario mínimo (COP)</label>
          <input type="number" min={0} value={form.salary_min ?? ''} onChange={(e) => setForm((f) => ({ ...f, salary_min: e.target.value ? Number(e.target.value) : undefined }))} placeholder="3000000" />
        </div>
        <div className="form-group">
          <label>Salario máximo (COP)</label>
          <input type="number" min={0} value={form.salary_max ?? ''} onChange={(e) => setForm((f) => ({ ...f, salary_max: e.target.value ? Number(e.target.value) : undefined }))} placeholder="6000000" />
        </div>
        <div className="form-group">
          <label>Fecha límite</label>
          <input type="date" value={form.deadline ?? ''} onChange={set('deadline')} />
        </div>
      </div>

      <div className="form-group">
        <label>Descripción del cargo</label>
        <textarea value={form.description ?? ''} onChange={set('description')} placeholder="Describe las responsabilidades, requisitos y beneficios del cargo..." rows={4} style={{ resize: 'vertical' }} />
      </div>

      <div className="form-group">
        <label>Skills / Tecnologías</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
            placeholder="React, Node.js, Python..." style={{ flex: 1 }} />
          <button type="button" onClick={addSkill}
            style={{ padding: '9px 14px', borderRadius: 'var(--radius)', background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, whiteSpace: 'nowrap' }}>
            + Agregar
          </button>
        </div>
        {form.skills && form.skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {form.skills.map((s) => (
              <span key={s} style={{
                fontSize: 11.5, padding: '3px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-2)',
                fontFamily: 'var(--font-mono)',
              }}>
                {s}
                <button type="button" onClick={() => removeSkill(s)} style={{ color: 'var(--text-3)', lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '11px' }}>
        {loading ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear vacante'}
      </button>
    </form>
  );
}
