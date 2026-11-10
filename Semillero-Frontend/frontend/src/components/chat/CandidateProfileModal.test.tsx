import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Candidate, CandidateProfileDetail } from '../../types';

const get = vi.fn();
const logContact = vi.fn();
const undoReject = vi.fn();

vi.mock('../../services/candidateProfileService', () => ({
  candidateProfileService: {
    get: (...a: unknown[]) => get(...a),
    logContact: (...a: unknown[]) => logContact(...a),
    undoReject: (...a: unknown[]) => undoReject(...a),
  },
}));

import { CandidateProfileModal } from './CandidateProfileModal';

const card = { id: 'c1', kind: 'legacy', full_name: 'Laura Ríos', position: 'Contadora', source: 'scraping' } as Candidate;

const scraped: CandidateProfileDetail = {
  kind: 'legacy', id: 'c1', full_name: 'Laura Ríos', position: '', headline: 'Contadora Pública | NIIF',
  summary: 'Auditoría y revisoría fiscal.', location: 'Cali', experience_years: 6, expected_salary: null,
  source: 'scraping', status: 'seguimiento', resume_url: null, profile_url: null,
  contact: { email: 'laura@correo.com', phone: '+573001234567', linkedin_url: 'https://www.linkedin.com/in/laura-rios' },
  experience: [], education: [], skills: [], last_contact: null, rejections: [],
  sender: { recruiter_name: 'Sofía Pérez', company_name: 'Acme SAS' },
};

describe('CandidateProfileModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue(scraped);
    logContact.mockResolvedValue({ channel: 'whatsapp', created_at: '2026-11-09T15:00:00Z' });
  });

  it('candidato externo: muestra el extracto de LinkedIn y los datos de contacto', async () => {
    render(<CandidateProfileModal candidate={card} onClose={vi.fn()} />);

    expect(await screen.findByText('Extracto público de LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('Auditoría y revisoría fiscal.')).toBeInTheDocument();
    expect(screen.getByText('+57 300 123 4567')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir perfil en LinkedIn' })).toHaveAttribute('href', scraped.contact.linkedin_url);
    expect(get).toHaveBeenCalledWith('legacy', 'c1');
  });

  it('mensajes viejos sin kind piden el perfil con auto', async () => {
    render(<CandidateProfileModal candidate={{ ...card, kind: undefined }} onClose={vi.fn()} />);
    await screen.findByText('Laura Ríos', { selector: 'h2' });
    expect(get).toHaveBeenCalledWith('auto', 'c1');
  });

  it('WhatsApp con mensaje personalizado y editable; registra el contacto al abrirlo', async () => {
    const onContacted = vi.fn();
    render(<CandidateProfileModal candidate={card} initialTab="contactar" onClose={vi.fn()} onContacted={onContacted} />);

    const textarea = await screen.findByRole('textbox', { name: /Mensaje/ });
    expect((textarea as HTMLTextAreaElement).value).toContain('Hola Laura');
    expect((textarea as HTMLTextAreaElement).value).toContain('Soy Sofía Pérez, de Acme SAS.');
    expect((textarea as HTMLTextAreaElement).value).toContain('Contadora Pública');

    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Hola Laura, ¿hablamos?');

    const send = screen.getByRole('link', { name: 'Abrir WhatsApp' });
    expect(send).toHaveAttribute('href', `https://wa.me/573001234567?text=${encodeURIComponent('Hola Laura, ¿hablamos?')}`);

    await userEvent.click(send);
    // Abrir WhatsApp no registra nada: hay que confirmar que se envió
    expect(logContact).not.toHaveBeenCalled();
    expect(screen.getByText('¿Le enviaste el mensaje por WhatsApp?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, lo envié' }));
    await waitFor(() => expect(logContact).toHaveBeenCalledWith('legacy', 'c1', 'whatsapp'));
    expect(onContacted).toHaveBeenCalledWith('c1', { channel: 'whatsapp', created_at: '2026-11-09T15:00:00Z' });
    expect(await screen.findByText(/Último contacto: WhatsApp/)).toBeInTheDocument();
  });

  it('si no lo envió, no se registra el contacto', async () => {
    render(<CandidateProfileModal candidate={card} initialTab="contactar" onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Abrir WhatsApp' }));
    await userEvent.click(screen.getByRole('button', { name: 'No todavía' }));
    expect(logContact).not.toHaveBeenCalled();
    expect(screen.queryByText(/¿Le enviaste el mensaje/)).toBeNull();
  });

  it('correo usa mailto con asunto; sin teléfono WhatsApp queda deshabilitado', async () => {
    get.mockResolvedValue({ ...scraped, contact: { ...scraped.contact, phone: null } });
    render(<CandidateProfileModal candidate={card} initialTab="contactar" onClose={vi.fn()} />);

    expect(await screen.findByRole('radio', { name: /WhatsApp/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Correo/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('link', { name: 'Abrir correo' }).getAttribute('href'))
      .toMatch(/^mailto:laura@correo\.com\?subject=Oportunidad%20laboral%3A%20Contadora%20P%C3%BAblica/);
  });

  it('muestra para qué puestos se rechazó y permite deshacerlo', async () => {
    get.mockResolvedValue({
      ...scraped,
      rejections: [{ id: 'r1', kind: 'legacy', candidate_id: 'c1', role_label: 'Contador público', role_key: 'contad publi', vacancy_id: null, reason: 'Sin NIIF', created_at: '2026-11-09T15:00:00Z' }],
    });
    undoReject.mockResolvedValue(undefined);
    const onRejectionUndone = vi.fn();
    render(<CandidateProfileModal candidate={card} onClose={vi.fn()} onRejectionUndone={onRejectionUndone} />);

    expect(await screen.findByText('Contador público')).toBeInTheDocument();
    expect(screen.getByText(/Sin NIIF/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }));

    await waitFor(() => expect(undoReject).toHaveBeenCalledWith('legacy', 'c1', 'r1'));
    expect(screen.queryByText('Contador público')).not.toBeInTheDocument();
    expect(onRejectionUndone).toHaveBeenCalledWith('c1');
  });

  it('vista de la empresa: solo lectura, con quién lo presentó y sin contacto hasta autorizarlo', async () => {
    get.mockResolvedValue({
      ...scraped,
      contact: { email: null, phone: null, linkedin_url: scraped.contact.linkedin_url },
      rejections: [],
      presentation: { presented: true, presented_at: '2026-11-02T15:00:00Z', presented_by: 'Sofía Pérez', vacancy_title: 'Contador público', company_decision: 'pendiente', decision_reason: null },
    });
    render(<CandidateProfileModal readOnly candidate={card} initialTab="contactar" onClose={vi.fn()} />);

    expect(await screen.findByText('Cómo llegó a ti')).toBeInTheDocument();
    expect(screen.getByText('Sofía Pérez')).toBeInTheDocument();
    expect(screen.getByText('Contador público')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de tu decisión')).toBeInTheDocument();
    expect(screen.getByText('El teléfono y el correo se muestran cuando lo autorizas para la siguiente fase.')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contactar' })).not.toBeInTheDocument();
  });
});
