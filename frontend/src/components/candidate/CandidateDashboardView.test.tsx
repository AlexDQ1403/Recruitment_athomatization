import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CandidateDashboard } from '../../services/candidatePortalService';

const dashboard = vi.fn();
vi.mock('../../services/candidatePortalService', () => ({ candidatePortalService: { dashboard: (...a: unknown[]) => dashboard(...a) } }));
vi.mock('../../lib/auth', () => ({ getStoredUser: () => ({ full_name: 'Laura Medina', role: 'candidato' }) }));

import { CandidateDashboardView } from './CandidateDashboardView';

const base: CandidateDashboard = {
  searching_since: '2026-10-20T12:00:00Z', searching_days: 21, last_applied_days: 8,
  totals: { total: 6, internal: 4, external: 2, last_7d: 0, last_30d: 6 },
  by_state: { sin_respuesta: 3, en_proceso: 1, entrevista: 1, avanza: 0, no_continua: 1 },
  response_rate: 50, avg_days_to_response: 4.5, avg_match: 72,
  weekly: Array.from({ length: 8 }, (_, i) => ({ week_start: `2026-09-${String(21 + i).padStart(2, '0')}`, count: i === 5 ? 4 : i === 6 ? 2 : 0 })),
  follow_up: [{ kind: 'externa', id: 'e1', title: 'Contador junior', company: 'Omega', source: 'elempleo.com', state: 'sin_respuesta', applied_at: '2026-10-25T12:00:00Z', changed_at: null, days_since_applied: 16, match: 70 }],
  recent_changes: [{ kind: 'interna', id: 'i1', title: 'Analista contable', company: 'Beta', source: null, state: 'entrevista', applied_at: '2026-10-28T12:00:00Z', changed_at: new Date().toISOString(), days_since_applied: 13, match: 80 }],
  external_enabled: true, profile_strength: { filled: 6, total: 6, missing: [] }, has_cv: true,
};

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CandidateDashboardView />
    </QueryClientProvider>
  );

describe('CandidateDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboard.mockResolvedValue(base);
  });

  it('cuánto lleva buscando, cuántas envió y la tasa de respuesta', async () => {
    renderView();
    expect(await screen.findByText('21 días')).toBeInTheDocument();
    expect(screen.getByText(/0 esta semana, 6 en 30 días/)).toBeInTheDocument();
    expect(screen.getByText('50 %')).toBeInTheDocument();
    expect(screen.getByText(/Llevas una semana sin postularte/)).toBeInTheDocument();
    expect(screen.getByText(/4 en la plataforma y 2 en otros sitios/)).toBeInTheDocument();
  });

  it('seguimiento y cambios recientes, con el origen de cada postulación', async () => {
    renderView();
    const follow = within((await screen.findByRole('heading', { name: 'Haz seguimiento' })).closest('section')!);
    expect((await follow.findByText('Contador junior')).closest('li')).toHaveTextContent('Te postulaste hace 16 días');
    expect(follow.getByText(/Externa · elempleo.com/)).toBeInTheDocument();
    const changes = within(screen.getByRole('heading', { name: 'Cambios de estado recientes' }).closest('section')!);
    expect(changes.getByText('Analista contable').closest('li')).toHaveTextContent('Entrevista · hoy');
  });

  it('sin postulaciones: explica cómo empezar', async () => {
    dashboard.mockResolvedValue({ ...base, totals: { total: 0, internal: 0, external: 0, last_7d: 0, last_30d: 0 }, has_cv: false });
    renderView();
    expect(await screen.findByRole('heading', { name: 'Empieza tu búsqueda' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subir mi HV' })).toHaveAttribute('href', '/candidate/profile');
  });
});
