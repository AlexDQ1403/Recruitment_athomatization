'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vacancyService, CreateVacancyInput } from '../../services/vacancyService';
import { Vacancy, VacancyStatus } from '../../types';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Icon } from '../ui/Icon';
import { ApplicantsModal } from './ApplicantsModal';
import { VacancyForm } from './VacancyForm';
import { getStoredUser } from '../../lib/auth';

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
  const [viewingCandidates, setViewingCandidates] = useState<Vacancy | null>(null);
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
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] }); // dashboard: vacantes activas
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
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
      setEditing(null);
      toast.success('Vacante actualizada');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vacancyService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
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

      {viewingCandidates && (
        <ApplicantsModal vacancy={viewingCandidates} onClose={() => {
          setViewingCandidates(null);
          queryClient.invalidateQueries({ queryKey: ['vacancies'] }); // refresca el contador de postulantes
        }} />
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
            <button onClick={() => refetch()} style={{ marginLeft: 12, color: 'var(--accent-text)', fontSize: 13 }}>Reintentar</button>
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
            <span className="empty-icon"><Icon name="clipboard" size={22} /></span>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 4 }}>No hay vacantes{statusFilter ? ` con estado "${STATUS_LABELS[statusFilter as VacancyStatus]}"` : ''}</p>
            <p style={{ fontSize: 12 }}>Crea una vacante para empezar a recibir aplicaciones</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {data?.items.map((v) => (
              <VacancyCard
                showCompany={getStoredUser()?.role === 'superAdmin'}
                key={v.id}
                vacancy={v}
                onEdit={() => setEditing(v)}
                onDelete={() => setDeleteTarget(v)}
                onCopyLink={() => copyLink(v.id)}
                onViewCandidates={() => setViewingCandidates(v)}
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

function VacancyCard({ vacancy: v, showCompany, onEdit, onDelete, onCopyLink, onToggleStatus, onViewCandidates }: {
  vacancy: Vacancy;
  showCompany: boolean;
  onViewCandidates: () => void;
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
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontFamily: 'var(--font-display)', color: 'var(--text-1)', lineHeight: 1.35 }}>
            {v.title}
          </h3>
          <span className={`badge ${STATUS_COLORS[v.status]}`} style={{ flexShrink: 0, fontSize: 10 }}>
            {STATUS_LABELS[v.status]}
          </span>
        </div>
        {showCompany && <p style={{ fontSize: 12.5, color: 'var(--accent-text)', fontWeight: 600 }}>{v.company}</p>}
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

      <div className="vac-foot">
        <div className="vac-meta">
          <button type="button" className="btn-save vac-main" onClick={onViewCandidates}>
            <Icon name="users" size={14} /> Ver postulantes ({v.applicants_count ?? 0})
          </button>
          {v.deadline && (
            <span style={{ fontSize: 11.5, color: new Date(v.deadline) < new Date() ? 'var(--red)' : 'var(--text-3)' }}>
              Cierra {new Date(v.deadline).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
        <div className="vac-actions">
          <button type="button" className="vac-btn" onClick={onCopyLink}>
            <Icon name="link" size={13} /> Copiar enlace
          </button>
          <button type="button" className={`vac-btn ${v.status === 'active' ? 'pause' : 'play'}`} onClick={onToggleStatus}>
            <Icon name={v.status === 'active' ? 'pause' : 'play'} size={13} /> {v.status === 'active' ? 'Pausar' : 'Activar'}
          </button>
          <button type="button" className="vac-btn" onClick={onEdit}>
            <Icon name="edit" size={13} /> Editar
          </button>
          <button type="button" className="vac-btn danger" onClick={onDelete}>
            <Icon name="trash" size={13} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
