'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { companyCandidateService } from '../../services/companyCandidateService';
import { COMPANY_DECISION_LABELS, CompanyDecision } from '../../types';
import { ConfirmModal } from '../ui/ConfirmModal';

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

  const mutation = useMutation({
    mutationFn: (d: 'contratar' | 'descartar') => companyCandidateService.decide(candidate, d),
    onSettled: () => {
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ['company-candidates'] });
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
        <ConfirmModal
          message={hire
            ? `¿Contratar a ${candidate.full_name}? Esta decisión es definitiva.`
            : `¿Descartar a ${candidate.full_name}? Esta decisión es definitiva.`}
          confirmLabel={hire ? 'Contratar' : 'Descartar'}
          danger={!hire}
          onConfirm={() => mutation.mutate(pending)}
          onCancel={() => setPending(null)}
        />
      )}
      <div role="group" aria-label={`Decisión sobre ${candidate.full_name}`} style={{ display: 'flex', gap: 6 }}>
        <button type="button" disabled={mutation.isPending} onClick={() => setPending('contratar')}
          style={{ ...BTN, color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)' }}>
          Contratar
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
