import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyReport } from '../../services/reportService';

const getResults = vi.fn();
vi.mock('../../services/reportService', () => ({
  reportService: { getResults: (...a: unknown[]) => getResults(...a), resultsToCsv: () => '' },
}));
vi.mock('../../lib/auth', () => ({ getStoredUser: () => ({ full_name: 'Acme SAS', role: 'empresa' }) }));
vi.mock('./ContactedActivity', () => ({ ContactedActivity: () => <p>Detalle de contactos</p> }));

import { ReportsView } from './ReportsView';

const report: CompanyReport = {
  range: { from: '2026-11-01T05:00:00.000Z', to: '2026-11-11T04:59:59.999Z' },
  totals: { found: 40, contacted: 20, presented: 5, authorized: 1, discarded: 3, avg_days_to_decide: 2.5, avg_days_to_first_presented: 6, pending_now: 1 },
  vacancies: [{ id: 'v1', title: 'Contador público', status: 'active', created_at: '2026-10-01', found: 40, contacted: 20, presented: 5, authorized: 1, discarded: 3, days_to_first_presented: 6 }],
  unassigned: { found: 0, contacted: 0 },
  discard_reasons: [{ reason: 'No tiene inglés', count: 2 }],
  discarded_without_reason: 1,
  recruiters: [{ id: 'r1', full_name: 'Sofía', contacted: 20, presented: 5, authorized: 1, discarded: 3, hit_rate: 25 }],
};

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReportsView />
    </QueryClientProvider>
  );

describe('ReportsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResults.mockResolvedValue(report);
  });

  it('resumen con conversión, motivo principal y tablas por vacante y reclutador', async () => {
    renderView();
    expect(await screen.findByText(/sobre todo por «No tiene inglés» \(2\)/)).toBeInTheDocument();
    const summary = within(screen.getByRole('heading', { name: 'Resumen del periodo' }).closest('section')!);
    expect(summary.getByText('Contactados').closest('li')).toHaveTextContent('50 %');
    expect(summary.getByText('Autorizados a siguiente fase').closest('li')).toHaveTextContent('25 % de lo decidido');
    expect(screen.getByText('Contador público').closest('tr')).toHaveTextContent('6 días');
    expect(screen.getByText('Sofía').closest('tr')).toHaveTextContent('25 %');
    expect(screen.getByText(/1 descarte quedó sin motivo/)).toBeInTheDocument();
  });

  it('cambiar el periodo vuelve a pedir el reporte; personalizado permite elegir fechas', async () => {
    renderView();
    await screen.findByText('Contador público');
    await userEvent.click(screen.getByRole('button', { name: 'Últimos 90 días' }));
    expect(getResults).toHaveBeenCalledTimes(2);
    const [from, to] = getResults.mock.calls[1];
    expect((new Date(to).getTime() - new Date(from).getTime()) / 86400000).toBe(89);

    await userEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
  });

  it('la actividad de contactos sigue disponible en su pestaña', async () => {
    renderView();
    await userEvent.click(screen.getByRole('tab', { name: 'Actividad de contactos' }));
    expect(screen.getByText('Detalle de contactos')).toBeInTheDocument();
  });
});
