import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyCandidateProcess } from '../../types';

const list = vi.fn();
const decide = vi.fn();

vi.mock('../../services/companyCandidateService', () => ({
  companyCandidateService: { list: (...a: unknown[]) => list(...a), decide: (...a: unknown[]) => decide(...a) },
}));

import { CompanyCandidatesHistoryView } from './CompanyCandidatesHistoryView';

const row = (over: Partial<CompanyCandidateProcess> & { candidate: CompanyCandidateProcess['candidate'] }): CompanyCandidateProcess => ({
  kind: 'legacy', decision: 'pendiente', decided_at: null,
  recruiter: { id: 'r1', full_name: 'Rita Reclutadora' }, vacancy: { id: 'v1', title: 'Python' },
  presented_at: '2026-03-02T12:00:00Z', status: 'en_contacto', status_history: [], ...over,
});

const pending = row({ candidate: { id: 'l1', full_name: 'Carlos Ruiz', position: 'Dev', location: null, experience_years: null } });
const hired = row({ kind: 'profile', decision: 'contratado', candidate: { id: 'cp1', full_name: 'Ana Pérez', position: 'Datos', location: null, experience_years: null } });

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CompanyCandidatesHistoryView />
    </QueryClientProvider>
  );

describe('CompanyCandidatesHistoryView (la empresa decide)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ candidates: [pending, hired], total: 2, limit: 200, offset: 0, summary: { pendiente: 1, contratado: 1, descartado: 0 } });
    decide.mockResolvedValue({ decision: 'contratado' });
  });

  it('muestra los candidatos aprobados y el resumen de decisiones', async () => {
    renderView();
    expect(await screen.findByText('Carlos Ruiz')).toBeTruthy();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText(/por decidir/)).toBeTruthy();
    expect(screen.getByText(/autorizados/)).toBeTruthy();
    expect(screen.getAllByText('Rita Reclutadora', { selector: 'td' })).toHaveLength(2);
  });

  it('los pendientes tienen Autorizar y Descartar; los ya decididos solo la insignia', async () => {
    renderView();
    const carlos = (await screen.findByText('Carlos Ruiz')).closest('tr')!;
    expect(within(carlos).getByRole('button', { name: 'Autorizar' })).toBeTruthy();
    expect(within(carlos).getByRole('button', { name: 'Descartar' })).toBeTruthy();

    const ana = screen.getByText('Ana Pérez').closest('tr')!;
    expect(within(ana).getByText('Autorizado').className).toContain('badge-hired');
    expect(within(ana).queryByRole('button', { name: 'Autorizar' })).toBeNull();
  });

  it('descartar pide confirmación; al confirmar envía origen, id y decisión', async () => {
    renderView();
    const carlos = (await screen.findByText('Carlos Ruiz')).closest('tr')!;

    await userEvent.click(within(carlos).getByRole('button', { name: 'Descartar' }));
    expect(decide).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Descartar a Carlos Ruiz\?/)).toBeTruthy();

    // El motivo es opcional y le llega al reclutador
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.type(dialog.getByRole('textbox'), 'No tiene inglés');
    await userEvent.click(dialog.getByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(decide).toHaveBeenCalledWith({ kind: 'legacy', id: 'l1', full_name: 'Carlos Ruiz' }, 'descartar', 'No tiene inglés'));
  });

  it('cancelar la confirmación no registra nada', async () => {
    renderView();
    const carlos = (await screen.findByText('Carlos Ruiz')).closest('tr')!;

    await userEvent.click(within(carlos).getByRole('button', { name: 'Autorizar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(decide).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza la decisión, lo muestra', async () => {
    decide.mockRejectedValue(new Error('Ya decidiste sobre este candidato: contratado'));
    renderView();
    const carlos = (await screen.findByText('Carlos Ruiz')).closest('tr')!;

    await userEvent.click(within(carlos).getByRole('button', { name: 'Autorizar' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Autorizar' })[0]);

    expect((await screen.findByRole('alert')).textContent).toContain('Ya decidiste');
  });

  it('sin candidatos aprobados explica cómo llegan', async () => {
    list.mockResolvedValue({ candidates: [], total: 0, limit: 200, offset: 0, summary: { pendiente: 0, contratado: 0, descartado: 0 } });
    renderView();
    expect(await screen.findByText(/Aparecerán aquí cuando un reclutador los apruebe/)).toBeTruthy();
  });
});
