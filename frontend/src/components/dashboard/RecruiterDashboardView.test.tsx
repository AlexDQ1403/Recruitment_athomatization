import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RecruiterDashboard } from '../../types';

const recruiter = vi.fn();

vi.mock('../../services/dashboardService', () => ({
  dashboardService: { recruiter: (...a: unknown[]) => recruiter(...a) },
}));
vi.mock('../../lib/auth', () => ({ getStoredUser: () => ({ full_name: 'Rita Reclutadora', role: 'recruiter' }) }));
// El perfil completo se prueba aparte: aquí basta con saber qué se abrió
vi.mock('../chat/CandidateProfileModal', () => ({
  CandidateProfileModal: ({ candidate, initialTab }: { candidate: { full_name: string }; initialTab: string }) => (
    <div role="dialog">Perfil de {candidate.full_name} ({initialTab})</div>
  ),
}));

import { RecruiterDashboardView } from './RecruiterDashboardView';

const data: RecruiterDashboard = {
  filters: { period: '30d' },
  funnel: { candidates: 40, contacted: 20, approved: 2, hired: 1, rejected: 5 },
  actions: {
    follow_up: { total: 9, items: [{ kind: 'legacy', id: 'l1', full_name: 'Laura Ríos', title: 'Contadora', vacancy_title: 'Contador público', days: 5 }] },
    new_applicants: { total: 1, items: [{ kind: 'profile', id: 'p1', full_name: 'Mario Díaz', title: 'Auxiliar contable', vacancy_title: 'Auxiliar contable', days: 2 }] },
    awaiting_company: { total: 0, items: [] },
  },
  vacancies: [
    { id: 'v3', title: 'Enfermera', days_open: 6, deadline_days: null, candidates: 0, contacted: 0, approved: 0, hired: 0, alert: 'sin_candidatos' },
    { id: 'v1', title: 'Contador público', days_open: 20, deadline_days: null, candidates: 12, contacted: 8, approved: 2, hired: 1, alert: null },
  ],
  sources: [
    { source: 'scraping', candidates: 30, contacted: 15, approved: 1, hired: 0 },
    { source: 'applicant', candidates: 10, contacted: 5, approved: 1, hired: 1 },
  ],
  vacancy_options: [{ id: 'v1', title: 'Contador público', status: 'active' }, { id: 'v3', title: 'Enfermera', status: 'active' }],
  pipeline: { counts: { sin_revisar: 0, seguimiento: 0, contactado: 0, aprobado: 0, contratado: 0, descartado_empresa: 0, rechazado: 0, sin_vacante: 0 }, total: 0, rows: [] },
};

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecruiterDashboardView />
    </QueryClientProvider>
  );

describe('RecruiterDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recruiter.mockResolvedValue(data);
  });

  it('embudo con conversión entre pasos y el punto donde más se pierde', async () => {
    renderView();
    const funnel = within((await screen.findByRole('heading', { name: 'Embudo de selección' })).closest('section')!);
    await funnel.findByText('40');
    expect(funnel.getByText('Contactados').closest('li')).toHaveTextContent('50 %');
    expect(funnel.getByText('Aprobados').closest('li')).toHaveTextContent('10 %');
    // El cuello de botella: de contactados (20) a aprobados (2)
    expect(document.querySelector('.dash-insight')).toHaveTextContent('de contactados a aprobados (solo 10 % avanza). 5 fueron rechazados');
  });

  it('qué hacer hoy: abre el perfil para contactar directamente', async () => {
    renderView();
    const card = within((await screen.findByText('Recontactar o decidir')).closest('.dash-action-card') as HTMLElement);
    expect(await card.findByText('9')).toBeInTheDocument();
    expect(card.getByText(/Contactado hace 5 días/)).toBeInTheDocument();
    expect(card.getByText('y 8 más')).toBeInTheDocument();

    await userEvent.click(card.getByRole('button', { name: 'Contactar' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Perfil de Laura Ríos (contactar)');
    expect(screen.getByText('La empresa no ha decidido').closest('.dash-action-card')).toHaveTextContent('Nada pendiente.');
  });

  it('vacantes: dice qué hacer y lleva al chat a buscar candidatos', async () => {
    renderView();
    const row = (await screen.findByText('Enfermera', { selector: '.dash-vacancy-title' })).closest('tr')!;
    expect(row).toHaveTextContent('Sin candidatos');
    expect(row).toHaveTextContent('6 días abierta sin nadie');
    expect(within(row).getByRole('link', { name: 'Buscar en el chat' })).toHaveAttribute('href', '/chat?q=Enfermera');
    expect(screen.getByText('Contador público', { selector: '.dash-vacancy-title' }).closest('tr')).toHaveTextContent('Al día');
  });

  it('orígenes con su tasa de aprobación', async () => {
    renderView();
    const sources = within((await screen.findByRole('heading', { name: /De dónde salen/ })).closest('section')!);
    expect(sources.getByText('Búsqueda externa').closest('li')).toHaveTextContent('3 % aprobados');
    expect(sources.getByText('Postulante').closest('li')).toHaveTextContent('10 % aprobados · 1 autorizado');
  });

  it('los filtros vuelven a consultar con periodo, vacante y origen', async () => {
    renderView();
    await screen.findByText('Recontactar o decidir');
    expect(recruiter).toHaveBeenLastCalledWith({ period: '30d' });

    await userEvent.selectOptions(screen.getByLabelText('Periodo'), '7d');
    await userEvent.selectOptions(screen.getByLabelText('Vacante'), 'v1');
    await userEvent.selectOptions(screen.getByLabelText('Origen'), 'scraping');

    await waitFor(() => expect(recruiter).toHaveBeenLastCalledWith({ period: '7d', vacancyId: 'v1', source: 'scraping' }));
  });

  it('reclutador nuevo (sin candidatos ni vacantes): "Empieza aquí" en vez de ceros', async () => {
    recruiter.mockResolvedValue({
      ...data,
      funnel: { candidates: 0, contacted: 0, approved: 0, hired: 0, rejected: 0 },
      vacancies: [], sources: [], vacancy_options: [],
      pipeline: { ...data.pipeline, total: 0, rows: [] },
    });
    renderView();
    expect(await screen.findByRole('heading', { name: 'Empieza aquí' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar candidatos' })).toHaveAttribute('href', '/chat');
    expect(screen.getByRole('link', { name: 'Crear vacante' })).toHaveAttribute('href', '/vacancies');
    expect(screen.queryByRole('heading', { name: 'Embudo de selección' })).toBeNull();
  });
});
