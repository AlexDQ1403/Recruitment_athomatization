import { supabase } from '../lib/supabase';
import { Candidate, CandidateStatus, CandidateDecision, CandidateDecisionState, CandidateNote, StatusHistoryEntry, PaginatedResponse } from '../types';

// El backend acepta hasta 100 ids por consulta
const DECISION_LOOKUP_CHUNK = 100;

export interface CandidateFilters {
  search?: string;
  status?: CandidateStatus;
  location?: string;
  source?: 'internal' | 'scraping' | 'applicant';
  min_experience?: number;
  max_experience?: number;
  min_salary?: number;
  max_salary?: number;
}

export interface CreateCandidateInput {
  full_name: string;
  email?: string;
  phone?: string;
  position: string;
  experience_years?: number;
  expected_salary?: number;
  location?: string;
  resume_url?: string;
}

export const candidateService = {
  async create(data: CreateCandidateInput): Promise<Candidate> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: result, error } = await supabase
      .from('candidates')
      .insert({ ...data, created_by: user?.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result as Candidate;
  },

  async list(page: number, limit = 15, filters: CandidateFilters = {}): Promise<PaginatedResponse<Candidate>> {
    let query = supabase.from('candidates').select('*', { count: 'exact' });

    if (filters.search) {
      query = query.or(
        `full_name.ilike.%${filters.search}%,position.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
      );
    }
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.location) query = query.ilike('location', `%${filters.location}%`);
    if (filters.min_experience !== undefined) query = query.gte('experience_years', filters.min_experience);
    if (filters.max_experience !== undefined) query = query.lte('experience_years', filters.max_experience);
    if (filters.min_salary !== undefined) query = query.gte('expected_salary', filters.min_salary);
    if (filters.max_salary !== undefined) query = query.lte('expected_salary', filters.max_salary);

    const from = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return { items: data as Candidate[], total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async listByStatus(): Promise<Record<CandidateStatus, Candidate[]>> {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);

    const grouped: Record<CandidateStatus, Candidate[]> = {
      seguimiento: [], 'en_contacto': [], rechazado: [],
    };
    for (const c of (data ?? []) as Candidate[]) {
      grouped[c.status]?.push(c);
    }
    return grouped;
  },

  async getById(id: string): Promise<Candidate> {
    const { data, error } = await supabase.from('candidates').select('*').eq('id', id).single();
    if (error) throw new Error('Candidato no encontrado');
    return data as Candidate;
  },

  async update(id: string, data: Partial<CreateCandidateInput>): Promise<Candidate> {
    const { data: result, error } = await supabase
      .from('candidates')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result as Candidate;
  },

  /**
   * Cambia el estado del candidato a través del backend, que valida la
   * transición, registra el historial y —al pasar a 'en_contacto'— dispara
   * el agendamiento de entrevista vía n8n.
   */
  async updateStatus(id: string, status: CandidateStatus, _previousStatus?: CandidateStatus): Promise<Candidate> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch(`/api/candidates/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al cambiar el estado');
    }

    return res.json() as Promise<Candidate>;
  },

  /**
   * Aprueba al candidato para que la Empresa lo vea en su Dashboard e
   * histórico de procesos (solo reclutador, ver migración 018).
   */
  async presentToCompany(id: string): Promise<{ presented_to_company: boolean; presented_at: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch(`/api/candidates/${id}/present`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al presentar el candidato a la empresa');
    }

    return res.json();
  },

  /**
   * Decisión del reclutador: aprobar (entra en la lista de aceptados de la
   * empresa), dejar en seguimiento o rechazar. La autorización la valida el
   * backend; el rechazo es terminal.
   */
  async decide(
    id: string,
    decision: CandidateDecision,
    reason?: string,
    /** Vacante del cargo: aprobar o dar seguimiento la exigen si el candidato no tiene una. */
    vacancyId?: string
  ): Promise<{ id: string; status: CandidateStatus; presented: boolean; vacancy_id?: string | null; unchanged?: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch(`/api/candidates/${id}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ decision, ...(reason ? { reason } : {}), ...(vacancyId ? { vacancy_id: vacancyId } : {}) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'No se pudo aplicar la decisión');
    }
    return res.json();
  },

  /** Estado vigente de varios candidatos. Los ids que no existan en la empresa no aparecen en el resultado. */
  async getDecisions(ids: string[]): Promise<Record<string, CandidateDecisionState>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return {};

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const result: Record<string, CandidateDecisionState> = {};
    for (let i = 0; i < unique.length; i += DECISION_LOOKUP_CHUNK) {
      const chunk = unique.slice(i, i + DECISION_LOOKUP_CHUNK);
      const res = await fetch(`/api/candidates/decisions?ids=${chunk.join(',')}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('No se pudo consultar el estado de los candidatos');
      Object.assign(result, await res.json());
    }
    return result;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('candidates').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getStatsByStatus(): Promise<Record<string, number>> {
    const { data, error } = await supabase.from('candidates').select('status');
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((acc: Record<string, number>, c: { status: string }) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {});
  },

  // ─── Notas ───────────────────────────────────────────────

  async getNotes(candidateId: string): Promise<CandidateNote[]> {
    const { data, error } = await supabase
      .from('candidate_notes')
      .select('*, author:profiles(full_name, email)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data as unknown as CandidateNote[];
  },

  async addNote(candidateId: string, content: string): Promise<CandidateNote> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');
    const { data, error } = await supabase
      .from('candidate_notes')
      .insert({ candidate_id: candidateId, author_id: user.id, content })
      .select('*, author:profiles(full_name, email)')
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as CandidateNote;
  },

  async deleteNote(noteId: string): Promise<void> {
    const { error } = await supabase.from('candidate_notes').delete().eq('id', noteId);
    if (error) throw new Error(error.message);
  },

  // ─── Historial de etapas ─────────────────────────────────

  async getStatusHistory(candidateId: string): Promise<StatusHistoryEntry[]> {
    const { data, error } = await supabase
      .from('candidate_status_history')
      .select('*, changer:profiles(full_name)')
      .eq('candidate_id', candidateId)
      .order('changed_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data as unknown as StatusHistoryEntry[];
  },

  // ─── CV Upload ───────────────────────────────────────────

  async uploadResume(candidateId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'pdf';
    const path = `${candidateId}/cv-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(path);

    const { error: updateError } = await supabase
      .from('candidates')
      .update({ resume_url: publicUrl })
      .eq('id', candidateId);
    if (updateError) throw new Error(updateError.message);

    return publicUrl;
  },
};
