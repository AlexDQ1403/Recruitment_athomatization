import { supabase } from '../lib/supabase';
import { ApplicationStatus } from '../types';

export interface MyProfile {
  id: string;
  full_name: string;
  email: string;
  position: string | null;
  experience_years: number | null;
  expected_salary: number | null;
  location: string | null;
  phone: string | null;
  cv_url: string | null;
  linkedin_url: string | null;
  visible: boolean;
}

export interface VacancySummary {
  id: string;
  title: string;
  description?: string | null;
  location: string | null;
  modality: string;
  salary_min: number | null;
  salary_max: number | null;
  experience_years_min?: number | null;
  skills?: string[] | null;
  status?: string;
  company: { id: string; name: string };
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  vacancy: VacancySummary;
  company: { id: string; name: string };
}

const MAX_CV_BYTES = 5 * 1024 * 1024;
const ALLOWED_CV_EXT = ['pdf', 'doc', 'docx'];

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autorizado');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json() as Promise<T>;
}

export const candidatePortalService = {
  async getProfile(): Promise<MyProfile> {
    const res = await fetch('/api/me/profile', { headers: await authHeaders() });
    return handle<MyProfile>(res, 'Error al cargar tu perfil');
  },

  async updateProfile(updates: Partial<MyProfile>): Promise<MyProfile> {
    const res = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handle<MyProfile>(res, 'Error al guardar los cambios');
  },

  async listApplications(): Promise<MyApplication[]> {
    const res = await fetch('/api/me/applications', { headers: await authHeaders() });
    const data = await handle<{ applications: MyApplication[] }>(res, 'Error al cargar postulaciones');
    return data.applications ?? [];
  },

  async listVacancies(): Promise<VacancySummary[]> {
    const res = await fetch('/api/me/vacancies', { headers: await authHeaders() });
    const data = await handle<{ vacancies: VacancySummary[] }>(res, 'Error al cargar vacantes');
    return data.vacancies ?? [];
  },

  async apply(vacancyId: string, coverLetter?: string): Promise<void> {
    const res = await fetch('/api/me/applications', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ vacancy_id: vacancyId, cover_letter: coverLetter }),
    });
    await handle(res, 'Error al postularte');
  },

  /**
   * Sube el CV a Storage bajo la carpeta del propio usuario. La ruta se deriva
   * de su id de sesión, no de un valor del formulario: así no puede escribir en
   * la carpeta de otro candidato.
   */
  async uploadCv(file: File): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autorizado');

    if (file.size > MAX_CV_BYTES) {
      throw new Error('El archivo supera los 5 MB');
    }

    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_CV_EXT.includes(ext)) {
      throw new Error(`Formato no permitido. Usa: ${ALLOWED_CV_EXT.join(', ')}`);
    }

    const path = `${user.id}/cv-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(path);
    await candidatePortalService.updateProfile({ cv_url: publicUrl });
    return publicUrl;
  },
};
