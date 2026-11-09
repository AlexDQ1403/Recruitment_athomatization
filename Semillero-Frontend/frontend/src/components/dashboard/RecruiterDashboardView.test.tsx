import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RecruiterDashboard } from '../../types';

const recruiter = vi.fn();

vi.mock('../../services/dashboardService', () => ({
  dashboardService: { recruiter: (...a: unknown[]) => recruiter(...a) },
}));
vi.mock('../../lib/auth', () => ({ getStoredUser: () => ({ full_name: 'Rita Reclutadora', role: 'recruiter' }) }));
vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { PieChart: Stub, Pie: Stub, Cell: Stub, Tooltip: Stub, ResponsiveContainer: Stub, BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub };
});

import { RecruiterDashboardView } from './RecruiterDashboardView';

const summary: RecruiterDashboard = {
  pipeline: { seguimiento: 2, en_contacto: 1, rechazado: 1 },
  total: 4,
  approved: 1,
  hired: 2,
  vacancies: { active: 2, paused: 1, closed: 0, applicants_active: 3, top: [{ id: 'v1', title: 'Python', applicants: 2 }, { id: 'v2', title: 'QA', applicants: 1 }] },
  recent: [
    { kind: 'profile', id: 'cp1', full_name: 'Ana Pérez', title: 'Ingeniera de Datos', location: 'Bogotá', status: 'en_contacto', vacancy_title: 'Python', created_at: '2026-03-05T12:00:00Z' },
    { kind: 'legacy', id: 'l1', full_name: 'Carlos Ruiz', title: null, location: null, status: 'seguimiento', vacancy_title: null, created_at: '2026-03-01T12:00:00Z' },
  ],
};

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecruiterDashboardView />
    </QueryClientProvider>
  );

const stat = (label: string) => screen.getByText(label, { selector: '.stat-label' }).closest('.stat-card') as HTMLElement;

describe('RecruiterDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recruiter.mockResolvedValue(summary);
  });

  it('muestra el pipeline, los aprobados y las vacantes activas con sus aplicantes', async () => {
    renderView();
    await screen.findByText('Total candidatos');
    await screen.findByText('Ana Pérez');

    expect(within(stat('Total candidatos')).getByText('4')).toBeTruthy();
    expect(within(stat('En Seguimiento')).getByText('2')).toBeTruthy();
    expect(within(stat('En Contacto')).getByText('1')).toBeTruthy();
    expect(within(stat('Rechazados')).getByText('1')).toBeTruthy();
    expect(within(stat('Aprobados para la empresa')).getByText('1')).toBeTruthy();
    const vacancies = within(stat('Vacantes activas'));
    expect(vacancies.getByText('2')).toBeTruthy();
    expect(vacancies.getByText('3 aplicantes')).toBeTruthy();
  });

  it('muestra cuántos candidatos contrató la empresa', async () => {
    renderView();
    await screen.findByText('Ana Pérez'); // espera a que lleguen los datos (la tarjeta existe desde el inicio, con 0)
    expect(within(stat('Contratados por la empresa')).getByText('2')).toBeTruthy();
  });

  it('REGRESIÓN: ya no hay "Tasa de contratación" (usaba un estado "hired" que no existe)', async () => {
    renderView();
    await screen.findByText('Total candidatos');
    expect(screen.queryByText(/contratación/i)).toBeNull();
  });

  it('lista las vacantes más pedidas con enlace a /vacancies', async () => {
    renderView();
    const link = (await screen.findByText('Python', { selector: 'a span' })).closest('a')!;
    expect(link.getAttribute('href')).toBe('/vacancies');
    expect(screen.getByText('2 aplicantes')).toBeTruthy();
    expect(screen.getByText('1 aplicante')).toBeTruthy();
  });

  it('actividad reciente: título, vacante y la insignia con clases que existen', async () => {
    renderView();
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(row).getByText('Ingeniera de Datos')).toBeTruthy();
    expect(within(row).getByText('Python')).toBeTruthy();
    expect(within(row).getByText('En Contacto').className).toContain('badge-interviewed');

    const carlos = screen.getByText('Carlos Ruiz').closest('tr')!;
    expect(within(carlos).getByText('Seguimiento').className).toContain('badge-pending');
    expect(within(carlos).getAllByText('—')).toHaveLength(2); // sin título ni vacante
  });

  it('sin vacantes activas invita a publicar una', async () => {
    recruiter.mockResolvedValue({ ...summary, vacancies: { active: 0, paused: 0, closed: 0, applicants_active: 0, top: [] }, recent: [] });
    renderView();
    expect(await screen.findByText(/No tienes vacantes activas/)).toBeTruthy();
    expect(screen.getByText('Aún no hay actividad.')).toBeTruthy();
  });

  it('si falla muestra el mensaje del servidor y permite reintentar', async () => {
    recruiter.mockRejectedValueOnce(new Error('El dashboard no está disponible'));
    renderView();
    expect((await screen.findByRole('alert')).textContent).toContain('El dashboard no está disponible');

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Pérez')).toBeTruthy();
  });
});
