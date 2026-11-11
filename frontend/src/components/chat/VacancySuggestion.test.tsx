import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const match = vi.fn();
const draft = vi.fn();
const create = vi.fn();
const linkCandidates = vi.fn();
vi.mock('../../services/vacancyService', () => ({
  vacancyService: {
    match: (...a: unknown[]) => match(...a),
    draft: (...a: unknown[]) => draft(...a),
    create: (...a: unknown[]) => create(...a),
    linkCandidates: (...a: unknown[]) => linkCandidates(...a),
  },
}));

import { VacancySuggestion } from './VacancySuggestion';

type Props = Parameters<typeof VacancySuggestion>[0];

const renderIt = (props: Partial<Props> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VacancySuggestion role="contadora" query="Busco contadora en Bogotá" reason="accion" onDismiss={vi.fn()} {...props} />
    </QueryClientProvider>
  );

describe('VacancySuggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draft.mockResolvedValue({ draft: { title: 'Contador(a) público(a)', modality: 'presencial', experience_years_min: 0, skills: [] }, notes: [] });
    create.mockResolvedValue({ id: 'v9', title: 'Contador(a) público(a)' });
  });

  it('si ya existe la vacante del cargo y no hay a quién asociar, no muestra nada', async () => {
    match.mockResolvedValue({ id: 'v1', title: 'Contador público' });
    const { container } = renderIt();
    await waitFor(() => expect(match).toHaveBeenCalledWith('contadora'));
    expect(container).toBeEmptyDOMElement();
  });

  it('en cualquier búsqueda sin vacante propone crearla', async () => {
    match.mockResolvedValue(null);
    renderIt({ reason: 'busqueda' });
    expect(await screen.findByText(/Aún no tienes una vacante para/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear vacante con IA' })).toBeInTheDocument();
  });

  it('si no existe, propone crearla: abre el formulario con la propuesta de la búsqueda y crea al confirmar', async () => {
    match.mockResolvedValue(null);
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear vacante con IA' }));

    await waitFor(() => expect(draft).toHaveBeenCalledWith('Busco contadora en Bogotá'));
    expect(create).not.toHaveBeenCalled();
    await screen.findByDisplayValue('Contador(a) público(a)');
    await userEvent.click(screen.getByRole('button', { name: 'Crear vacante' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(await screen.findByText('Vacante «Contador(a) público(a)» creada.')).toBeInTheDocument();
  });

  it('sin resultados lo dice con otro texto y se puede descartar', async () => {
    match.mockResolvedValue(null);
    const onDismiss = vi.fn();
    renderIt({ reason: 'sin-resultados', onDismiss });
    expect(await screen.findByText(/No hay candidatos para esto todavía/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('al crear la vacante asocia a los candidatos trabajados y explica lo que no pudo asociar', async () => {
    match.mockResolvedValue(null);
    linkCandidates.mockResolvedValue({ linked: ['c1'], skipped: [{ id: 'p1', reason: 'cuenta_propia' }] });
    const related = [
      { id: 'c1', kind: 'legacy', full_name: 'Laura' },
      { id: 'p1', kind: 'profile', full_name: 'Mario' },
    ] as Props['related'];
    renderIt({ related });

    await userEvent.click(await screen.findByRole('button', { name: 'Crear vacante con IA' }));
    expect(screen.getByText(/se asociarán los 2 candidatos .*Laura, Mario/)).toBeInTheDocument();
    await screen.findByDisplayValue('Contador(a) público(a)');
    await userEvent.click(screen.getByRole('button', { name: 'Crear vacante' }));

    await waitFor(() => expect(linkCandidates).toHaveBeenCalledWith('v9', [{ kind: 'legacy', id: 'c1' }, { kind: 'profile', id: 'p1' }]));
    expect(await screen.findByText(/1 candidato asociado · 1 con cuenta propia/)).toBeInTheDocument();
  });

  it('si la vacante ya existe, ofrece asociar a los candidatos trabajados', async () => {
    match.mockResolvedValue({ id: 'v1', title: 'Contador público' });
    linkCandidates.mockResolvedValue({ linked: ['c1'], skipped: [] });
    renderIt({ related: [{ id: 'c1', kind: 'legacy', full_name: 'Laura' }] as Props['related'] });

    await userEvent.click(await screen.findByRole('button', { name: 'Asociar 1 candidato' }));
    await waitFor(() => expect(linkCandidates).toHaveBeenCalledWith('v1', [{ kind: 'legacy', id: 'c1' }]));
    expect(await screen.findByText('1 candidato asociado')).toBeInTheDocument();
  });
});
