'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vacancyService } from '../../services/vacancyService';
import { CandidateStatus, COMPANY_DECISION_LABELS, STATUS_LABELS, Vacancy, VacancyApplicant } from '../../types';
import { ConfirmModal } from '../ui/ConfirmModal';
import { getStoredUser } from '../../lib/auth';
import { CompanyDecisionControl, DECISION_BADGE } from '../company/CompanyDecisionControl';

const BADGE: Record<CandidateStatus, string> = {
  seguimiento: 'badge-pending',
  en_contacto: 'badge-interviewed',
  rechazado: 'badge-rejected',
};

// Acciones del reclutador. Rechazar es terminal y pide confirmación.
const ACTIONS: { status: CandidateStatus; label: string }[] = [
  { status: 'seguimiento', label: 'Seguimiento' },
  { status: 'en_contacto', label: 'En contacto' },
  { status: 'rechazado', label: 'Rechazar' },
];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export function ApplicantsModal({ vacancy, onClose }: { vacancy: Vacancy; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<VacancyApplicant | null>(null);
  const queryKey = ['vacancy-applicants', vacancy.id];
  // La empresa solo recibe a los aprobados y decide contratar/descartar; el reclutador aprueba y gestiona el pipeline
  const isCompany = getStoredUser()?.role === 'empresa';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => vacancyService.applicants(vacancy.id),
  });

  const mutation = useMutation({
    mutationFn: ({ applicant, status }: { applicant: VacancyApplicant; status: CandidateStatus }) =>
      vacancyService.setApplicantStatus(vacancy.id, applicant, status),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] }); // dashboard del reclutador
    },
  });

  const approve = useMutation({
    mutationFn: (applicant: VacancyApplicant) => vacancyService.approveApplicant(vacancy.id, applicant),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
      queryClient.invalidateQueries({ queryKey: ['company-candidates'] });
    },
  });
  const failure = mutation.error ?? approve.error;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rejectTarget) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, rejectTarget]);

  const pendingId = mutation.isPending ? mutation.variables?.applicant.id : approve.isPending ? approve.variables?.id : null;
  const items = data?.items ?? [];

  const choose = (applicant: VacancyApplicant, status: CandidateStatus) => {
    if (status === applicant.status) return;
    if (status === 'rechazado') setRejectTarget(applicant);
    else mutation.mutate({ applicant, status });
  };

  return (
    <>
      {rejectTarget && (
        <ConfirmModal
          message={`¿Rechazar a ${rejectTarget.full_name}? Es definitivo: un candidato rechazado no se puede reactivar.`}
          confirmLabel="Rechazar"
          onConfirm={() => { mutation.mutate({ applicant: rejectTarget, status: 'rechazado' }); setRejectTarget(null); }}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={`Candidatos de ${vacancy.title}`}
          style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h3>Candidatos</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{vacancy.title}</p>
            </div>
            <button onClick={onClose} className="modal-close" aria-label="Cerrar">×</button>
          </div>

          {failure && (
            <div className="form-error" role="alert" style={{ marginBottom: 12 }}>
              {failure instanceof Error ? failure.message : 'No se pudo completar la acción'}
            </div>
          )}

          <div style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius)' }} />
            ))}

            {isError && (
              <div role="alert" style={{ padding: 24, textAlign: 'center', color: 'var(--red)' }}>
                {error instanceof Error ? error.message : 'No se pudieron cargar los candidatos'}
                <button onClick={() => refetch()} style={{ marginLeft: 12, color: 'var(--accent-text)', fontSize: 13 }}>Reintentar</button>
              </div>
            )}

            {!isLoading && !isError && items.length === 0 && (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                {isCompany ? 'Aún no hay candidatos aprobados por tus reclutadores en esta vacante.' : 'Aún no hay candidatos en esta vacante.'}
              </div>
            )}

            {items.map((a) => {
              const busy = pendingId === a.id;
              const meta = [a.location, a.experience_years != null ? `${a.experience_years} años de experiencia` : null].filter(Boolean).join(' · ');
              return (
                <div key={`${a.kind}-${a.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', opacity: busy ? 0.6 : 1,
                }}>
                  <span aria-hidden style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
                  }}>{initials(a.full_name)}</span>

                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 600 }}>{a.full_name}</span>
                      {!isCompany && <span className={`badge ${BADGE[a.status]}`} style={{ fontSize: 10 }}>{STATUS_LABELS[a.status]}</span>}
                      {!isCompany && a.presented && <span className="badge badge-hired" style={{ fontSize: 10 }}>Aprobado</span>}
                      {!isCompany && a.company_decision !== 'pendiente' && (
                        <span className={`badge ${DECISION_BADGE[a.company_decision]}`} style={{ fontSize: 10 }}>
                          Empresa: {COMPANY_DECISION_LABELS[a.company_decision].toLowerCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{a.title ?? 'Sin título indicado'}</div>
                    {meta && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{meta}</div>}
                  </div>

                  {isCompany ? (
                    <CompanyDecisionControl candidate={{ kind: a.kind, id: a.id, full_name: a.full_name }} decision={a.company_decision} />
                  ) : a.company_decision !== 'pendiente' ? (
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>La empresa ya decidió</span>
                  ) : a.status === 'rechazado' ? (
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Rechazado: no se puede reactivar</span>
                  ) : (
                    <div role="group" aria-label={`Cambiar estado de ${a.full_name}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" disabled={busy || a.presented} aria-pressed={a.presented}
                        title="Presentar este candidato a la empresa"
                        onClick={() => approve.mutate(a)}
                        style={{
                          padding: '6px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: a.presented ? 'var(--surface-3)' : 'color-mix(in srgb, var(--green) 14%, transparent)',
                          color: a.presented ? 'var(--text-3)' : 'var(--green)',
                          border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)',
                          cursor: busy || a.presented ? 'default' : 'pointer',
                        }}>
                        {a.presented ? 'Aprobado' : 'Aprobar'}
                      </button>
                      {ACTIONS.map(({ status, label }) => {
                        const current = a.status === status;
                        const danger = status === 'rechazado';
                        return (
                          <button key={status} type="button" disabled={busy || current} aria-pressed={current}
                            onClick={() => choose(a, status)}
                            style={{
                              padding: '6px 11px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                              background: current ? 'var(--accent)' : 'var(--surface-3)',
                              color: current ? 'var(--text-inv)' : danger ? 'var(--red)' : 'var(--text-2)',
                              border: `1px solid ${current ? 'var(--accent)' : danger ? 'color-mix(in srgb, var(--red) 35%, transparent)' : 'var(--border)'}`,
                              cursor: busy || current ? 'default' : 'pointer',
                            }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
