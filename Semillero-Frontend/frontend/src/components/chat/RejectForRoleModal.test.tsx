import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Candidate } from '../../types';

const reject = vi.fn();
const list = vi.fn();

vi.mock('../../services/candidateProfileService', () => ({
  candidateProfileService: { reject: (...a: unknown[]) => reject(...a) },
}));
vi.mock('../../services/vacancyService', () => ({
  vacancyService: { list: (...a: unknown[]) => list(...a) },
}));

import { RejectForRoleModal } from './RejectForRoleModal';

const card = { id: 'c1', kind: 'legacy', full_name: 'Laura Ríos', position: 'Contadora', source: 'scraping' } as Candidate;

describe('RejectForRoleModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ items: [{ id: 'v1', title: 'Contador senior' }] });
    reject.mockResolvedValue({ id: 'r1', role_label: 'contador público' });
  });

  it('prellena el puesto con el cargo de la búsqueda y rechaza solo para ese puesto, con motivo', async () => {
    const onRejected = vi.fn();
    render(<RejectForRoleModal candidate={card} suggestedRole="contador público" onClose={vi.fn()} onRejected={onRejected} />);

    expect(screen.getByRole('textbox', { name: 'Puesto' })).toHaveValue('contador público');
    expect(screen.getByText(/Solo para este puesto/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /Motivo/ }), 'Sin NIIF');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar para este puesto' }));

    await waitFor(() => expect(reject).toHaveBeenCalledWith('legacy', 'c1', { role: 'contador público', vacancy_id: undefined, reason: 'Sin NIIF' }));
    expect(onRejected).toHaveBeenCalledWith({ id: 'r1', role_label: 'contador público' });
  });

  it('puede asociarse a una vacante; sin puesto ni vacante no envía nada', async () => {
    render(<RejectForRoleModal candidate={card} suggestedRole="" onClose={vi.fn()} onRejected={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar para este puesto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Indica el puesto o elige una vacante');
    expect(reject).not.toHaveBeenCalled();

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Vacante/ }), 'v1');
    expect(screen.getByRole('textbox', { name: 'Puesto' })).toHaveValue('Contador senior');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar para este puesto' }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith('legacy', 'c1', { role: 'Contador senior', vacancy_id: 'v1', reason: undefined }));
  });
});
