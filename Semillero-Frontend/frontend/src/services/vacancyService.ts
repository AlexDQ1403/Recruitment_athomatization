import { supabase } from '../lib/supabase';
import { Vacancy, VacancyStatus, PaginatedResponse } from '../types';

export interface CreateVacancyInput {
  title: string;
  company: string;
  description?: string;
  location?: string;
  modality: 'presencial' | 'remoto' | 'híbrido';
  salary_min?: number;
  salary_max?: number;
  experience_years_min?: number;
  skills?: string[];
  deadline?: string;
}

export const vacancyService = {
  async create(data: CreateVacancyInput): Promise<Vacancy> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: result, error } = await supabase
      .from('vacancies')
      .insert({ ...data, created_by: user?.id, status: 'active' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result as Vacancy;
  },

  async list(page = 1, limit = 12, status?: VacancyStatus): Promise<PaginatedResponse<Vacancy>> {
    let query = supabase
      .from('vacancies')
      .select('*, applicants_count:candidates(count)', { count: 'exact' });
    if (status) query = query.eq('status', status);

    const from = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw new Error(error.message);
    const items = (data ?? []).map((v: Vacancy & { applicants_count: { count: number }[] }) => ({
      ...v,
      applicants_count: v.applicants_count?.[0]?.count ?? 0,
    }));
    const total = count ?? 0;
    return { items: items as Vacancy[], total, page, limit, totalPages: Math.ceil(total / limit) };
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

  async update(id: string, data: Partial<CreateVacancyInput & { status: VacancyStatus }>): Promise<Vacancy> {
    const { data: result, error } = await supabase
      .from('vacancies')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result as Vacancy;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('vacancies').delete().eq('id', id);
    if (error) throw new Error(error.message);
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
