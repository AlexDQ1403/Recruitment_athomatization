import { supabase } from '../lib/supabase';
import { Vacancy, VacancyStatus, VacancyApplicant, CandidateStatus, PaginatedResponse } from '../types';

/**
 * Datos que escribe quien publica. No incluye la empresa: la pone el servidor a partir
 * de la sesión (un reclutador pertenece a una sola empresa).
 */
export interface CreateVacancyInput {
  title: string;
  description?: string;
  location?: string;
  modality: 'presencial' | 'remoto' | 'híbrido';
  salary_min?: number;
  salary_max?: number;
  experience_years_min?: number;
  skills?: string[];
  deadline?: string;
}

/**
 * La gestión de vacantes (publicar, listar, editar, pausar, borrar) pasa por el backend:
 * la empresa sale de la sesión y cada consulta se acota a ella. Leer y escribir directo en
 * Supabase dependía de las políticas RLS de `vacancies`, que en la base real no coincidían
 * con las del repo: la vacante se guardaba pero la lista salía vacía, sin error.
 */
async function api<T>(path: string, init: RequestInit = {}, fallback: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autorizado');

  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body as T;
}

export const vacancyService = {
  /** Publica la vacante: el servidor fija la empresa, quién la crea y el estado `active`. */
  create(data: CreateVacancyInput): Promise<Vacancy> {
    return api<Vacancy>('/api/vacancies', { method: 'POST', body: JSON.stringify(data) }, 'No se pudo publicar la vacante');
  },

  /** Vacantes de MI empresa, más nuevas primero. */
  list(page = 1, limit = 12, status?: VacancyStatus): Promise<PaginatedResponse<Vacancy>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    return api<PaginatedResponse<Vacancy>>(`/api/vacancies?${params}`, {}, 'Error al cargar vacantes');
  },

  async listPublic(): Promise<Vacancy[]> {
    const { data, error } = await supabase
      .from('vacancies')
      .select('id, title, company, description, location, modality, salary_min, salary_max, experience_years_min, skills, deadline, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data as Vacancy[];
  },

  async getById(id: string): Promise<Vacancy> {
    const { data, error } = await supabase
      .from('vacancies')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw new Error('Vacante no encontrada');
    return data as Vacancy;
  },

  /** Edita, pausa, activa o cierra. Un campo vacío ("") borra el valor; el servidor lo guarda como null. */
  update(id: string, data: Partial<CreateVacancyInput & { status: VacancyStatus }>): Promise<Vacancy> {
    return api<Vacancy>(`/api/vacancies/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }, 'No se pudo actualizar la vacante');
  },

  /** Solo el rol empresa puede eliminar (el backend lo exige). */
  async delete(id: string): Promise<void> {
    await api<{ success: boolean }>(`/api/vacancies/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'No se pudo eliminar la vacante');
  },

  /** Postulantes de una vacante de mi empresa (datos básicos y estado). */
  applicants(vacancyId: string): Promise<{ items: VacancyApplicant[]; total: number }> {
    return api(`/api/vacancies/${encodeURIComponent(vacancyId)}/applicants`, {}, 'No se pudieron cargar los candidatos');
  },

  /** El reclutador aprueba al candidato: desde ese momento la empresa lo ve y puede decidir. */
  approveApplicant(vacancyId: string, applicant: Pick<VacancyApplicant, 'kind' | 'id'>): Promise<{ presented: boolean; unchanged?: boolean }> {
    return api(
      `/api/vacancies/${encodeURIComponent(vacancyId)}/applicants/${applicant.kind}/${encodeURIComponent(applicant.id)}/approve`,
      { method: 'POST' },
      'No se pudo aprobar al candidato'
    );
  },

  /** Cambia el estado de un postulante: seguimiento, en_contacto o rechazado (terminal). */
  setApplicantStatus(vacancyId: string, applicant: Pick<VacancyApplicant, 'kind' | 'id'>, status: CandidateStatus): Promise<{ status: CandidateStatus; unchanged?: boolean }> {
    return api(
      `/api/vacancies/${encodeURIComponent(vacancyId)}/applicants/${applicant.kind}/${encodeURIComponent(applicant.id)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      'No se pudo cambiar el estado del candidato'
    );
  },

  async getApplicants(vacancyId: string) {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('vacancy_id', vacancyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },
};
