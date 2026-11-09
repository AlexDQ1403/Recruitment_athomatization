import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Vacancy, VacancyApplicant } from '../../types';

const applicants = vi.fn();
const setApplicantStatus = vi.fn();
const approveApplicant = vi.fn();
const decide = vi.fn();
let role = 'recruiter';

vi.mock('../../services/vacancyService', () => ({
  vacancyService: {
    applicants: (...a: unknown[]) => applicants(...a),
    setApplicantStatus: (...a: unknown[]) => setApplicantStatus(...a),
    approveApplicant: (...a: unknown[]) => approveApplicant(...a),
  },
}));
vi.mock('../../services/companyCandidateService', () => ({
  companyCandidateService: { decide: (...a: unknown[]) => decide(...a) },
}));
vi.mock('../../lib/auth', () => ({ getStoredUser: () => ({ full_name: 'Test', role }) }));

import { ApplicantsModal } from './ApplicantsModal';

const vacancy = { id: 'v1', title: 'Desarrollador Python' } as Vacancy;
const ana: VacancyApplicant = { kind: 'profile', id: 'cp-1', full_name: 'Ana Pérez', title: 'Ingeniera de datos', location: 'Bogotá', experience_years: 4, status: 'seguimiento', presented: false, company_decision: 'pendiente', applied_at: null };
const carlos: VacancyApplicant = { kind: 'legacy', id: 'l-1', full_name: 'Carlos Ruiz', title: null, location: null, experience_years: null, status: 'rechazado', presented: false, company_decision: 'pendiente', applied_at: null };

const renderModal = (onClose = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ApplicantsModal vacancy={vacancy} onClose={onClose} />
    </QueryClientProvider>
  );
  return onClose;
};

describe('ApplicantsModal (Ver candidatos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = 'recruiter';
    applicants.mockResolvedValue({ items: [ana, carlos], total: 2 });
    setApplicantStatus.mockResolvedValue({ status: 'en_contacto' });
    approveApplicant.mockResolvedValue({ presented: true });
    decide.mockResolvedValue({ decision: 'contratado' });
  });

  it('muestra nombre, título y estado de cada candidato de la vacante', async () => {
    renderModal();

    expect(await screen.findByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('Ingeniera de datos')).toBeTruthy();
    expect(screen.getByText(/4 años de experiencia/)).toBeTruthy();
    expect(screen.getByText('Sin título indicado')).toBeTruthy(); // Carlos no tiene título
    expect(applicants).toHaveBeenCalledWith('v1');
  });

  it('cambia el estado con los botones, enviando el origen y el id del candidato', async () => {
    renderModal();
    const group = within(await screen.findByRole('group', { name: /Ana Pérez/ }));

    await userEvent.click(group.getByRole('button', { name: 'En contacto' }));

    await waitFor(() => expect(setApplicantStatus).toHaveBeenCalledWith('v1', ana, 'en_contacto'));
  });

  it('el botón del estado actual está deshabilitado', async () => {
    renderModal();
    const group = within(await screen.findByRole('group', { name: /Ana Pérez/ }));
    expect((group.getByRole('button', { name: 'Seguimiento' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('rechazar pide confirmación y no cambia nada hasta confirmar', async () => {
    renderModal();
    const group = within(await screen.findByRole('group', { name: /Ana Pérez/ }));

    await userEvent.click(group.getByRole('button', { name: 'Rechazar' }));
    expect(setApplicantStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Rechazar a Ana Pérez\?/)).toBeTruthy();

    // El modal de confirmación se pinta antes que la lista: su botón es el primer "Rechazar"
    const [confirm] = screen.getAllByRole('button', { name: 'Rechazar' });
    expect(confirm.closest('[role="dialog"]')).toBeNull(); // es el de ConfirmModal, no el de la fila
    await userEvent.click(confirm);
    await waitFor(() => expect(setApplicantStatus).toHaveBeenCalledWith('v1', ana, 'rechazado'));
  });

  it('un candidato rechazado no ofrece botones (es terminal)', async () => {
    renderModal();
    await screen.findByText('Carlos Ruiz');
    expect(screen.queryByRole('group', { name: /Carlos Ruiz/ })).toBeNull();
    expect(screen.getByText(/no se puede reactivar/i)).toBeTruthy();
  });

  it('vacante sin candidatos: mensaje vacío', async () => {
    applicants.mockResolvedValue({ items: [], total: 0 });
    renderModal();
    expect(await screen.findByText(/Aún no hay candidatos/)).toBeTruthy();
  });

  it('error al cargar: muestra el mensaje del backend y permite reintentar', async () => {
    applicants.mockRejectedValueOnce(new Error('Vacante no encontrada'));
    renderModal();
    expect(await screen.findByText(/Vacante no encontrada/)).toBeTruthy();

    applicants.mockResolvedValue({ items: [ana], total: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Pérez')).toBeTruthy();
  });

  it('si el cambio de estado falla, muestra el error del servidor', async () => {
    setApplicantStatus.mockRejectedValue(new Error('Transición no permitida'));
    renderModal();
    const group = within(await screen.findByRole('group', { name: /Ana Pérez/ }));

    await userEvent.click(group.getByRole('button', { name: 'En contacto' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Transición no permitida');
  });

  it('se cierra con el botón y con Escape', async () => {
    const onClose = renderModal();
    await screen.findByText('Ana Pérez');

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(2);
  });
  describe('aprobar (reclutador)', () => {
    it('el botón Aprobar presenta al candidato a la empresa', async () => {
      renderModal();
      const group = within(await screen.findByRole('group', { name: /Ana Pérez/ }));

      await userEvent.click(group.getByRole('button', { name: 'Aprobar' }));

      await waitFor(() => expect(approveApplicant).toHaveBeenCalledWith('v1', ana));
    });

    it('un candidato ya aprobado muestra la marca y el botón queda deshabilitado', async () => {
      applicants.mockResolvedValue({ items: [{ ...ana, presented: true }], total: 1 });
      renderModal();
      const group = within(await screen.findByRole('group', { name: /Ana Pérez/ }));

      expect((group.getByRole('button', { name: 'Aprobado' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('si la empresa ya decidió, el reclutador ve la decisión y no puede cambiar el proceso', async () => {
      applicants.mockResolvedValue({ items: [{ ...ana, presented: true, company_decision: 'contratado' }], total: 1 });
      renderModal();

      expect(await screen.findByText(/Empresa: contratado/)).toBeTruthy();
      expect(screen.getByText('La empresa ya decidió')).toBeTruthy();
      expect(screen.queryByRole('group', { name: /Ana Pérez/ })).toBeNull();
    });

    it('si falla aprobar, muestra el error del servidor', async () => {
      approveApplicant.mockRejectedValue(new Error('Un candidato rechazado no se puede aprobar'));
      renderModal();
      const group = within(await screen.findByRole('group', { name: /Ana Pérez/ }));

      await userEvent.click(group.getByRole('button', { name: 'Aprobar' }));

      expect((await screen.findByRole('alert')).textContent).toContain('no se puede aprobar');
    });
  });

  describe('vista de la empresa', () => {
    const approvedAna = { ...ana, presented: true };

    it('no ofrece Aprobar ni el pipeline del reclutador: solo Contratar y Descartar', async () => {
      role = 'empresa';
      applicants.mockResolvedValue({ items: [approvedAna], total: 1 });
      renderModal();

      await screen.findByText('Ana Pérez');
      expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'En contacto' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Contratar' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Descartar' })).toBeTruthy();
    });

    it('contratar pide confirmación y envía el origen y el id del candidato', async () => {
      role = 'empresa';
      applicants.mockResolvedValue({ items: [approvedAna], total: 1 });
      renderModal();

      await userEvent.click(await screen.findByRole('button', { name: 'Contratar' }));
      expect(decide).not.toHaveBeenCalled();
      expect(screen.getByText(/¿Contratar a Ana Pérez\?/)).toBeTruthy();

      const [confirm] = screen.getAllByRole('button', { name: 'Contratar' });
      await userEvent.click(confirm);

      await waitFor(() => expect(decide).toHaveBeenCalledWith({ kind: 'profile', id: 'cp-1', full_name: 'Ana Pérez' }, 'contratar'));
    });

    it('una decisión ya tomada se muestra como insignia, sin botones', async () => {
      role = 'empresa';
      applicants.mockResolvedValue({ items: [{ ...approvedAna, company_decision: 'descartado' }], total: 1 });
      renderModal();

      expect(await screen.findByText('Descartado')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Contratar' })).toBeNull();
    });

    it('sin candidatos aprobados explica que los aprueba el reclutador', async () => {
      role = 'empresa';
      applicants.mockResolvedValue({ items: [], total: 0 });
      renderModal();
      expect(await screen.findByText(/aprobados por tus reclutadores/)).toBeTruthy();
    });
  });
});
