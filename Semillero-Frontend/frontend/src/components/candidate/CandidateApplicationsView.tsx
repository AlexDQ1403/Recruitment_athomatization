'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, VacancySummary } from '../../services/candidatePortalService';
import { APPLICATION_STATUS_LABELS, ApplicationStatus } from '../../types';
import { ToastContainer } from '../ui/Toast';
import { useToast } from '../../hooks/useToast';

const STATUS_CLASS: Record<ApplicationStatus, string> = {
  enviada: 'badge-pending',
  en_revision: 'badge-interviewed',
  descartada: 'badge-rejected',
  contactado: 'badge-hired',
};

const formatSalary = (min: number | null, max: number | null) => {
  if (!min && !max) return null;
  const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
};

export const CandidateApplicationsView = () => {
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: applications = [], isLoading: loadingApps } = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => candidatePortalService.listApplications(),
  });

  const { data: vacancies = [], isLoading: loadingVacancies } = useQuery({
    queryKey: ['open-vacancies'],
    queryFn: () => candidatePortalService.listVacancies(),
  });

  const applyMutation = useMutation({
    mutationFn: (vacancyId: string) => candidatePortalService.apply(vacancyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-applications'] });
      toast.success('Postulación enviada');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al postularte'),
  });

  const appliedIds = new Set(applications.map((a) => a.vacancy?.id));

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />

      <div className="page-header">
        <h1>Vacantes y postulaciones</h1>
        <p>Explora las ofertas abiertas y sigue el estado de tus procesos</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={tab === 'open' ? 'btn-primary' : 'btn-secondary-sm'}
          style={tab === 'open' ? { width: 'auto', padding: '6px 14px', fontSize: 12.5 } : undefined}
          onClick={() => setTab('open')}
        >
          Vacantes abiertas
        </button>
        <button
          className={tab === 'mine' ? 'btn-primary' : 'btn-secondary-sm'}
          style={tab === 'mine' ? { width: 'auto', padding: '6px 14px', fontSize: 12.5 } : undefined}
          onClick={() => setTab('mine')}
        >
          Mis postulaciones ({applications.length})
        </button>
      </div>

      {tab === 'open' ? (
        loadingVacancies ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 90, marginBottom: 10 }} />
          ))
        ) : vacancies.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No hay vacantes abiertas"
            hint="Vuelve más tarde: las empresas publican nuevas ofertas con frecuencia."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vacancies.map((v) => (
              <VacancyCard
                key={v.id}
                vacancy={v}
                applied={appliedIds.has(v.id)}
                onApply={() => applyMutation.mutate(v.id)}
                applying={applyMutation.isPending}
              />
            ))}
          </div>
        )
      ) : loadingApps ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 60, marginBottom: 10 }} />
        ))
      ) : applications.length === 0 ? (
        <EmptyState
          icon="✉️"
          title="Aún no te has postulado"
          hint="Revisa las vacantes abiertas y envía tu primera postulación."
        />
      ) : (
        <div className="candidate-table-wrapper">
          <table className="candidate-table">
            <thead>
              <tr>
                <th>Vacante</th>
                <th>Empresa</th>
                <th>Enviada</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id} className="table-row">
                  <td>{a.vacancy?.title ?? '—'}</td>
                  <td>{a.company?.name ?? '—'}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                    {new Date(a.created_at).toLocaleDateString('es-CO')}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[a.status] ?? 'badge-pending'}`}>
                      {APPLICATION_STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

const VacancyCard = ({
  vacancy,
  applied,
  onApply,
  applying,
}: {
  vacancy: VacancySummary;
  applied: boolean;
  onApply: () => void;
  applying: boolean;
}) => {
  const salary = formatSalary(vacancy.salary_min, vacancy.salary_max);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 18px',
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start',
    }}>
      <div>
        <p style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{vacancy.title}</p>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
          {vacancy.company?.name}
          {vacancy.location ? ` · ${vacancy.location}` : ''}
          {vacancy.modality ? ` · ${vacancy.modality}` : ''}
        </p>
        {salary && (
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{salary}</p>
        )}
        {vacancy.skills && vacancy.skills.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {vacancy.skills.slice(0, 6).map((s) => (
              <span key={s} className="badge badge-pending" style={{ fontSize: 11 }}>{s}</span>
            ))}
          </div>
        )}
      </div>
      <button
        className={applied ? 'btn-secondary-sm' : 'btn-primary'}
        style={applied ? undefined : { width: 'auto', padding: '8px 16px', fontSize: 13 }}
        onClick={onApply}
        disabled={applied || applying}
      >
        {applied ? 'Ya postulado' : applying ? 'Enviando...' : 'Postularme'}
      </button>
    </div>
  );
};

const EmptyState = ({ icon, title, hint }: { icon: string; title: string; hint: string }) => (
  <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
    <p style={{ fontSize: 32, marginBottom: 12 }}>{icon}</p>
    <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 6 }}>{title}</p>
    <p style={{ fontSize: 13 }}>{hint}</p>
  </div>
);
