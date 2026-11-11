import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const draft = vi.fn();
vi.mock('../../services/vacancyService', () => ({ vacancyService: { draft: (...a: unknown[]) => draft(...a) } }));

import { VacancyForm } from './VacancyForm';

const proposal = {
  draft: {
    title: 'Contador(a) público(a)', description: 'Resumen del rol', location: 'Bogotá', modality: 'híbrido',
    salary_max: 3000000, experience_years_min: 2, skills: ['NIIF', 'SIIGO'],
  },
  notes: ['No indicaste salario mínimo'],
};

describe('VacancyForm con IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draft.mockResolvedValue(proposal);
  });

  it('propone los campos a partir del texto; el reclutador edita y solo al confirmar se envía', async () => {
    const onSubmit = vi.fn();
    render(<VacancyForm onSubmit={onSubmit} loading={false} error={null} />);

    await userEvent.type(screen.getByLabelText('Descríbela con tus palabras'), 'necesito contadora en Bogotá, 2 años, hasta 3 millones');
    await userEvent.click(screen.getByRole('button', { name: 'Proponer vacante' }));

    await waitFor(() => expect(screen.getByLabelText('Título del cargo *')).toHaveValue('Contador(a) público(a)'));
    expect(screen.getByLabelText('Ciudad / Ubicación')).toHaveValue('Bogotá');
    expect(screen.getByLabelText('Modalidad')).toHaveValue('híbrido');
    expect(screen.getByLabelText('Salario máximo (COP)')).toHaveValue(3000000);
    expect(screen.getByText('NIIF')).toBeInTheDocument();
    expect(screen.getByText('No indicaste salario mínimo')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // Edita antes de confirmar
    const title = screen.getByLabelText('Título del cargo *');
    await userEvent.clear(title);
    await userEvent.type(title, 'Contadora senior');
    await userEvent.click(screen.getByRole('button', { name: 'Crear vacante' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contadora senior', location: 'Bogotá', skills: ['NIIF', 'SIIGO'] }));
  });

  it('con initialText (desde el chat) propone al abrir', async () => {
    render(<VacancyForm initialText="Busco contadora en Bogotá" onSubmit={vi.fn()} loading={false} error={null} />);
    await waitFor(() => expect(draft).toHaveBeenCalledWith('Busco contadora en Bogotá'));
    expect(await screen.findByDisplayValue('Contador(a) público(a)')).toBeInTheDocument();
  });

  it('si la IA falla, muestra el error y el formulario sigue disponible a mano', async () => {
    draft.mockRejectedValue(new Error('No se pudo generar la propuesta en este momento. Puedes llenar el formulario a mano.'));
    render(<VacancyForm onSubmit={vi.fn()} loading={false} error={null} />);
    await userEvent.type(screen.getByLabelText('Descríbela con tus palabras'), 'contadora Bogotá');
    await userEvent.click(screen.getByRole('button', { name: 'Proponer vacante' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/a mano/);
    expect(screen.getByLabelText('Título del cargo *')).toBeEnabled();
  });

  it('al editar una vacante existente no muestra el asistente', () => {
    render(
      <VacancyForm
        initial={{ id: 'v1', title: 'Contador', company: 'Acme', modality: 'presencial', status: 'active', created_at: '', updated_at: '' }}
        onSubmit={vi.fn()}
        loading={false}
        error={null}
      />
    );
    expect(screen.queryByLabelText('Descríbela con tus palabras')).toBeNull();
  });
});
