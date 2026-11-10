import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyDashboard, PipelineRow } from '../../types';

const company = vi.fn();

vi.mock('../../services/dashboardService', () => ({
  dashboardService: { company: (...a: unknown[]) => company(...a) },
}));
vi.mock('../../services/companyCandidateService', () => ({ companyCandidateService: { decide: vi.fn() } }));
vi.mock('../../lib/auth', () => ({ getStoredUser: () => ({ full_name: 'Acme SAS', role: 'empresa' }) }));
vi.mock('../chat/CandidateProfileModal', () => ({
  CandidateProfileModal: ({ candidate, readOnly }: { candidate: { full_name: string }; readOnly?: boolean }) => (
    <div role="dialog">Perfil de {candidate.full_name}{readOnly ? ' (solo lectura)' : ''}</div>
  ),
}));

import { EmpresaDashboardView } from './EmpresaDashboardView';

const row = (over: Partial<PipelineRow>): PipelineRow => ({
  kind: 'legacy', id: 'x', full_name: 'X', title: 'Contador', source: 'scraping', vacancy_id: 'v1', vacancy_title: 'Contador público',
  stage: 'aprobado', event: { label: 'Aprobado', at: '2026-11-01T12:00:00Z', by: 'Sofía', reason: null }, days: 1, next_action: null, ...over,
});

const data: CompanyDashboard = {
  kpis: { pending: 2, oldest_pending_days: 9, hired: 1, discarded: 1, avg_days_to_decide: 3, active_vacancies: 1 },
  pending: [row({ id: 'l1', full_name: 'Carlos Ruiz', days: 9 }), row({ id: 'l2', full_name: 'Ana Gómez', days: 2, event: { label: 'Aprobado', at: null, by: 'Andrés', reason: null } })],
  recent_decisions: [row({ id: 'l4', full_name: 'Rosa Díaz', stage: 'descartado_empresa', event: { label: 'La empresa lo descartó', at: '2026-11-05T12:00:00Z', by: null, reason: 'No tiene inglés' } })],
  vacancies: [{ id: 'v1', title: 'Contador público', days_open: 20, deadline_days: null, candidates: 4, contacted: 3, approved: 2, hired: 1, alert: null }],
  team: [{ id: 'r1', full_name: 'Sofía', last_login: null, suspended: false, contacted_30d: 5, presented: 3, hired: 1, hire_rate: 33 }],
};

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EmpresaDashboardView />
    </QueryClientProvider>
  );

describe('EmpresaDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    company.mockResolvedValue(data);
  });

  it('decisiones pendientes con quién lo presentó y cuánto lleva esperando', async () => {
    renderView();
    const section = within((await screen.findByRole('heading', { name: 'Necesitan tu decisión' })).closest('section')!);
    const carlos = (await section.findByText('Carlos Ruiz')).closest('tr')!;
    expect(carlos).toHaveTextContent('Sofía');
    expect(carlos).toHaveTextContent('9 días');
    expect(within(carlos).getByRole('button', { name: 'Autorizar' })).toBeInTheDocument();
    expect(screen.getByText(/lleva/)).toHaveTextContent('9 días');
  });

  it('abre el perfil en solo lectura', async () => {
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver perfil de Carlos Ruiz' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Perfil de Carlos Ruiz (solo lectura)');
  });

  it('equipo con su acierto y últimas decisiones con su motivo', async () => {
    renderView();
    const team = within((await screen.findByRole('heading', { name: 'Tu equipo de reclutamiento' })).closest('section')!);
    expect((await team.findByText('Sofía')).closest('tr')).toHaveTextContent('33 %');
    expect(team.getByText('Nunca ha entrado')).toBeInTheDocument();
    expect(screen.getByText(/No tiene inglés/)).toBeInTheDocument();
  });

  it('empresa nueva: explica cómo empezar', async () => {
    company.mockResolvedValue({ ...data, kpis: { ...data.kpis, pending: 0 }, pending: [], recent_decisions: [], vacancies: [], team: [] });
    renderView();
    expect(await screen.findByRole('heading', { name: 'Empieza aquí' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agregar reclutador' })).toHaveAttribute('href', '/recruiters');
  });
});
