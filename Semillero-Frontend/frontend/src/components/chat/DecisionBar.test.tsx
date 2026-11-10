import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Candidate, CandidateDecisionState } from '../../types';
import { DecisionBar } from './DecisionBar';

const c = { id: 'c1', full_name: 'Laura' } as Candidate;
const fresh: CandidateDecisionState = { status: 'seguimiento', presented: false, vacancy_id: null };
const vacancy = { id: 'v1', title: 'Contador público' };

describe('DecisionBar', () => {
  it('sin vacante del cargo (o mientras se consulta) no deja aprobar ni dar seguimiento', () => {
    const { container, rerender } = render(<DecisionBar candidate={c} state={fresh} vacancy={null} busy={false} onDecide={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DecisionBar candidate={c} state={fresh} vacancy={undefined} busy={false} onDecide={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('con la vacante del cargo, aprobar y seguimiento la envían; un candidato nuevo no aparece "en seguimiento"', async () => {
    const onDecide = vi.fn();
    render(<DecisionBar candidate={c} state={fresh} vacancy={vacancy} busy={false} onDecide={onDecide} />);

    const follow = screen.getByRole('button', { name: 'Seguimiento' });
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Aprobar' })).toHaveAttribute('title', expect.stringContaining('para «Contador público»'));

    await userEvent.click(follow);
    expect(onDecide).toHaveBeenCalledWith(c, 'seguimiento', 'v1');
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(onDecide).toHaveBeenCalledWith(c, 'aprobar', 'v1');
  });

  it('si ya está en una vacante usa esa (aunque el cargo no tenga vacante) y se ve en seguimiento', async () => {
    const onDecide = vi.fn();
    render(<DecisionBar candidate={c} state={{ ...fresh, vacancy_id: 'v9' }} vacancy={null} busy={false} onDecide={onDecide} />);
    expect(screen.getByRole('button', { name: 'Seguimiento' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(onDecide).toHaveBeenCalledWith(c, 'aprobar', undefined);
  });
});
