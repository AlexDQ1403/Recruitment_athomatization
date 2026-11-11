'use client';
import { Candidate, CandidateDecision, CandidateDecisionState, Vacancy } from '../../types';

export const DecisionBar = ({ candidate: c, state, vacancy, busy, onDecide }: {
  candidate: Candidate;
  state: CandidateDecisionState | null | undefined;
  vacancy: Pick<Vacancy, 'id' | 'title'> | null | undefined;
  busy: boolean;
  onDecide: (c: Candidate, decision: CandidateDecision, vacancyId?: string) => void;
}) => {
  if (!state) return null;

  if (state.status === 'rechazado') {
    return <span className="decision-state">Rechazado</span>;
  }

  // Ya en una vacante: el backend usa esa. Si no, la del cargo (si existe).
  const target = state.vacancy_id ? undefined : vacancy?.id;
  // Sin vacante (o mientras se consulta) no hay botones; el aviso va una vez arriba de la lista
  if (!state.vacancy_id && !vacancy) return null;
  const forVacancy = vacancy && !state.vacancy_id ? ` para «${vacancy.title}»` : '';
  // "En seguimiento" = está en la vacante y aún no se aprobó (no el estado inicial de todos)
  const following = !!state.vacancy_id && !state.presented && state.status === 'seguimiento';

  return (
    <div className="decision" role="group" aria-label={`Decisión sobre ${c.full_name}`} aria-busy={busy}>
      <button
        type="button"
        className={`decision-btn approve${state.presented ? ' is-on' : ''}`}
        onClick={() => onDecide(c, 'aprobar', target)}
        disabled={busy || state.presented}
        aria-pressed={state.presented}
        title={`Pasa a la lista de candidatos aceptados de la empresa${forVacancy}`}
      >
        {state.presented ? 'Aprobado' : 'Aprobar'}
      </button>
      <button
        type="button"
        className={`decision-btn${following ? ' is-on' : ''}`}
        onClick={() => onDecide(c, 'seguimiento', target)}
        disabled={busy || following}
        aria-pressed={following}
        title={`Lo sigue considerando${forVacancy} sin descartarlo (sale de la lista de aceptados)`}
      >
        Seguimiento
      </button>
    </div>
  );
};
