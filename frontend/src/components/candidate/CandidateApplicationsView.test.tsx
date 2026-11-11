import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MyApplication, Recommendations, VacancyMatch } from '../../services/candidatePortalService';

const recommendations = vi.fn();
const listApplications = vi.fn();
const cvAdvice = vi.fn();
const apply = vi.fn();
const externalJobs = vi.fn();
const listExternalApplications = vi.fn();
const addExternalApplication = vi.fn();
const externalCvAdvice = vi.fn();

vi.mock('../../services/candidatePortalService', () => ({
  candidatePortalService: {
    recommendations: (...a: unknown[]) => recommendations(...a),
    listApplications: (...a: unknown[]) => listApplications(...a),
    cvAdvice: (...a: unknown[]) => cvAdvice(...a),
    apply: (...a: unknown[]) => apply(...a),
    updateApplicationNote: vi.fn(),
    externalJobs: (...a: unknown[]) => externalJobs(...a),
    listExternalApplications: (...a: unknown[]) => listExternalApplications(...a),
    addExternalApplication: (...a: unknown[]) => addExternalApplication(...a),
    externalCvAdvice: (...a: unknown[]) => externalCvAdvice(...a),
    updateExternalApplication: vi.fn(),
    deleteExternalApplication: vi.fn(),
  },
}));

import { CandidateApplicationsView } from './CandidateApplicationsView';

const match = (score: number, over: Partial<VacancyMatch> = {}): VacancyMatch => ({
  score, parts: [{ factor: 'habilidades', score: score / 100, weight: 40 }], matched_skills: [], missing_skills: [], ...over,
});
const vacancy = (id: string, title: string, score: number, over = {}) => ({
  id, title, location: 'Bogotá', modality: 'presencial', salary_min: null, salary_max: 4_000_000, skills: [],
  deadline: null, created_at: '2026-11-01', applied: false, company: { id: 'c1', name: 'Acme' }, match: match(score), ...over,
});

const recs: Recommendations = {
  profile_strength: { filled: 4, total: 6, missing: ['Formación', 'Ciudad'] },
  has_cv: true,
  vacancies: [
    vacancy('v1', 'Contador público', 85, { match: match(85, { matched_skills: ['NIIF'], missing_skills: ['SAP'] }) }),
    vacancy('v2', 'Auxiliar de enfermería', 12),
  ],
};

const app = (over: Partial<MyApplication>): MyApplication => ({
  id: 'a1', status: 'enviada', stage: 'enviada', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  cover_letter: null, note: null, company: { id: 'c1', name: 'Acme' }, match: match(80),
  vacancy: { id: 'v9', title: 'Analista contable', location: 'Bogotá', modality: 'presencial', salary_min: null, salary_max: null, deadline: null, status: 'active' },
  ...over,
});

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CandidateApplicationsView />
    </QueryClientProvider>
  );

describe('CandidateApplicationsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recommendations.mockResolvedValue(recs);
    listApplications.mockResolvedValue({ applications: [], notes_enabled: true });
    cvAdvice.mockResolvedValue({
      match: recs.vacancies[0].match,
      profile_strength: recs.profile_strength,
      advice: { headline: 'Contadora pública con NIIF', summary: null, highlight: [], keywords: ['NIIF'], gaps: ['SAP: menciona tu manejo de SIIGO'], tips: [] },
    });
    apply.mockResolvedValue(undefined);
    listExternalApplications.mockResolvedValue({ applications: [], enabled: true });
    externalJobs.mockResolvedValue({
      query: 'Contadora', google_enabled: false, sources: [{ source: 'getonbrd', ok: true, count: 1 }],
      jobs: [{
        id: 'gob:analista-contable', source: 'getonbrd', source_label: 'Get on Board', title: 'Analista contable', company: 'Delta',
        location: 'Colombia · híbrido', remote: false, url: 'https://www.getonbrd.com/jobs/analista-contable', published_at: null,
        salary: null, description: 'NIIF', applied: false, match: match(60),
      }],
    });
    externalCvAdvice.mockResolvedValue({ match: match(60), profile_strength: recs.profile_strength, advice: { headline: null, summary: null, highlight: [], keywords: [], gaps: [], tips: ['Menciona NIIF'] } });
    addExternalApplication.mockResolvedValue({});
  });

  it('vacantes ordenadas por ajuste con porcentaje, lo que tiene y lo que le falta', async () => {
    renderView();
    const card = (await screen.findByText('Contador público')).closest('article')!;
    expect(card).toHaveTextContent('85 %');
    expect(card).toHaveTextContent('Muy afín');
    expect(within(card).getByText('NIIF')).toBeInTheDocument();
    expect(within(card).getByText('SAP')).toBeInTheDocument();
    expect(screen.getByText(/Te falta: formación, ciudad/)).toBeInTheDocument();
  });

  it('"solo afines" oculta las de menos de 50 %', async () => {
    renderView();
    await screen.findByText('Auxiliar de enfermería');
    await userEvent.click(screen.getByLabelText(/Solo afines/));
    expect(screen.queryByText('Auxiliar de enfermería')).not.toBeInTheDocument();
  });

  it('antes de postularse muestra cómo ajustar la HV a esa vacante y luego envía', async () => {
    renderView();
    const card = (await screen.findByText('Contador público')).closest('article')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Ver ajuste y postularme' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(await dialog.findByText('Contadora pública con NIIF')).toBeInTheDocument();
    expect(dialog.getByText('SAP: menciona tu manejo de SIIGO')).toBeInTheDocument();
    expect(cvAdvice).toHaveBeenCalledWith('v1');

    await userEvent.type(dialog.getByLabelText(/Mensaje para la empresa/), 'Me interesa');
    await userEvent.click(dialog.getByRole('button', { name: 'Enviar postulación' }));
    expect(apply).toHaveBeenCalledWith('v1', 'Me interesa');
  });

  it('mis postulaciones: etapa explicada y filtros por grupo', async () => {
    listApplications.mockResolvedValue({
      applications: [
        app({ id: 'a1', stage: 'preseleccionado' }),
        app({ id: 'a2', stage: 'no_continua', vacancy: { ...app({}).vacancy, title: 'Tesorero' } }),
      ],
      notes_enabled: true,
    });
    renderView();
    await userEvent.click(await screen.findByRole('tab', { name: /Mis postulaciones \(2\)/ }));
    expect(await screen.findByText('Tu perfil fue presentado a la empresa y está decidiendo.')).toBeInTheDocument();
    expect(screen.queryByText('Tesorero')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Finalizadas (1)' }));
    expect(screen.getByText('Tesorero')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar nota' })).toBeInTheDocument();
  });

  it('otros sitios: lleva a la oferta en su sitio y luego registra la postulación', async () => {
    renderView();
    await userEvent.click(screen.getByRole('tab', { name: 'Otros sitios web' }));
    const card = (await screen.findByText('Analista contable')).closest('article')!;
    expect(card).toHaveTextContent('Externa · Get on Board');
    await userEvent.click(within(card).getByRole('button', { name: 'Ver ajuste y postularme' }));

    const dialog = within(screen.getByRole('dialog'));
    expect(await dialog.findByText('Menciona NIIF')).toBeInTheDocument();
    expect(externalCvAdvice).toHaveBeenCalledWith('gob:analista-contable');
    const go = dialog.getByRole('link', { name: /Ir a postularme en Get on Board/ });
    expect(go).toHaveAttribute('href', 'https://www.getonbrd.com/jobs/analista-contable');
    expect(go).toHaveAttribute('target', '_blank');
    expect(go.getAttribute('rel')).toContain('noopener');

    await userEvent.click(go);
    await userEvent.click(dialog.getByRole('button', { name: 'Sí, registrarla' }));
    expect(addExternalApplication).toHaveBeenCalledWith({ job_id: 'gob:analista-contable' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('mis postulaciones junta las de la plataforma y las de otros sitios', async () => {
    listApplications.mockResolvedValue({ applications: [app({ id: 'a1', stage: 'en_revision' })], notes_enabled: true });
    listExternalApplications.mockResolvedValue({ enabled: true, applications: [{
      id: 'e1', source: 'elempleo.com', title: 'Contador junior', company: 'Omega', location: 'Bogotá', url: 'https://www.elempleo.com/x',
      status: 'entrevista', match_score: 70, note: null, applied_at: new Date().toISOString(), status_changed_at: null,
    }] });
    renderView();
    await userEvent.click(await screen.findByRole('tab', { name: /Mis postulaciones \(2\)/ }));
    const ext = (await screen.findByText('Contador junior')).closest('article')!;
    expect(ext).toHaveTextContent('Externa · elempleo.com');
    expect(within(ext).getByLabelText('¿Cómo va?')).toHaveValue('entrevista');
    expect(screen.getByText('Analista contable')).toBeInTheDocument();
  });
});
