'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { companyCandidateService } from '../../services/companyCandidateService';
import { COMPANY_DECISION_LABELS, CompanyDecision } from '../../types';

export const DECISION_BADGE: Record<CompanyDecision, string> = {
  pendiente: 'badge-pending',
  contratado: 'badge-hired',
  descartado: 'badge-rejected',
};

const BTN: React.CSSProperties = { padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: 'var(--surface-3)' };

/**
 * Decisión de la empresa sobre un candidato que un reclutador le presentó: contratar o
 * descartar. Es definitiva, así que pide confirmación. Una vez decidida, solo se muestra la insignia.
 */
export function CompanyDecisionControl({ candidate, decision }: {
  candidate: { kind: 'profile' | 'legacy'; id: string; full_name: string };
  decision: CompanyDecision;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<'contratar' | 'descartar' | null>(null);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: (d: 'contratar' | 'descartar') => companyCandidateService.decide(candidate, d, reason.trim() || undefined),
    onSettled: () => {
      setPending(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['company-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['company-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['vacancy-applicants'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
    },
  });

  if (decision !== 'pendiente') {
    return <span className={`badge ${DECISION_BADGE[decision]}`} style={{ fontSize: 11 }}>{COMPANY_DECISION_LABELS[decision]}</span>;
  }

  const hire = pending === 'contratar';
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      {pending && (
        <div className="modal-overlay" onClick={() => setPending(null)}>
          <form
            className="modal reject-modal"
            role="dialog"
            aria-modal="true"
            aria-label={hire ? 'Confirmar autorización' : 'Confirmar descarte'}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); mutation.mutate(pending); }}
          >
            <h2>{hire ? `¿Autorizar a ${candidate.full_name} para la siguiente fase?` : `¿Descartar a ${candidate.full_name}?`}</h2>
            <p className="reject-help">
              {hire
                ? 'Pasa a tu proceso interno (entrevistas, pruebas, exámenes). Verás su teléfono y correo para continuar con él.'
                : 'No seguirá en tu proceso para esta vacante.'}
              {' '}La decisión es definitiva y el reclutador que lo presentó la verá con tu comentario.
            </p>
            <label className="cp-field">
              <span>{hire ? 'Comentario (opcional)' : 'Motivo (opcional, pero le ayuda al reclutador a buscar mejor)'}</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={hire ? 'p. ej. Agendar prueba técnica la próxima semana' : 'p. ej. No tiene el nivel de inglés que necesitamos'}
              />
            </label>
            <div className="cp-actions">
              <button type="button" className="btn-secondary-sm" onClick={() => setPending(null)}>Cancelar</button>
              <button type="submit" className={`btn-save${hire ? '' : ' reject-confirm'}`} disabled={mutation.isPending}>
                {hire ? 'Autorizar' : 'Descartar'}
              </button>
            </div>
          </form>
        </div>
      )}
      <div role="group" aria-label={`Decisión sobre ${candidate.full_name}`} style={{ display: 'flex', gap: 6 }}>
        <button type="button" disabled={mutation.isPending} onClick={() => setPending('contratar')}
          style={{ ...BTN, color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)' }}>
          Autorizar
        </button>
        <button type="button" disabled={mutation.isPending} onClick={() => setPending('descartar')}
          style={{ ...BTN, color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 35%, transparent)' }}>
          Descartar
        </button>
      </div>
      {mutation.isError && (
        <span role="alert" style={{ fontSize: 11.5, color: 'var(--red)' }}>
          {mutation.error instanceof Error ? mutation.error.message : 'No se pudo registrar la decisión'}
        </span>
      )}
    </div>
  );
}
