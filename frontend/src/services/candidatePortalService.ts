import { supabase } from '../lib/supabase';
import { ApplicationStatus } from '../types';

export interface MyProfile {
  id: string;
  full_name: string;
  email: string;
  position: string | null;
  professional_title: string | null;
  professional_summary: string | null;
  experience_years: number | null;
  expected_salary: number | null;
  location: string | null;
  phone: string | null;
  cv_url: string | null;
  linkedin_url: string | null;
  visible: boolean;
}

export interface ExperienceEntry {
  id: string;
  company_name: string;
  role_title: string;
  start_date: string;
  end_date: string | null;
  description: string | null;
}
export type ExperienceInput = Omit<ExperienceEntry, 'id'>;

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  start_date: string | null;
  end_date: string | null;
}
export type EducationInput = Omit<EducationEntry, 'id'>;

export type SkillCategory = 'tecnica' | 'blanda' | 'idioma' | 'herramienta';
export interface SkillEntry {
  id: string;
  name: string;
  category: SkillCategory;
}

export interface SearchPreferences {
  target_position: string | null;
  technologies: string[];
  sectors: string[];
  modality: 'presencial' | 'remoto' | 'híbrido' | null;
  keywords: string[];
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

/** Qué tanto se ajusta el perfil a una vacante (backend/src/services/vacancyMatch.ts). */
export type MatchFactor = 'habilidades' | 'cargo' | 'experiencia' | 'ubicacion' | 'salario';
export interface VacancyMatch {
  score: number;
  parts: { factor: MatchFactor; score: number; weight: number; missing?: boolean }[];
  matched_skills: string[];
  missing_skills: string[];
}

export interface ProfileStrength {
  filled: number;
  total: number;
  /** Secciones vacías que vuelven poco confiable el porcentaje. */
  missing: string[];
}

export interface RecommendedVacancy extends VacancySummary {
  deadline: string | null;
  created_at: string;
  applied: boolean;
  match: VacancyMatch;
}

export interface Recommendations {
  profile_strength: ProfileStrength;
  has_cv: boolean;
  vacancies: RecommendedVacancy[];
}

/** Etapa de la postulación, contada al candidato. */
export type ApplicationStage = 'enviada' | 'en_revision' | 'contactado' | 'preseleccionado' | 'siguiente_fase' | 'no_continua';

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  stage: ApplicationStage;
  created_at: string;
  updated_at: string;
  cover_letter: string | null;
  /** Nota privada del candidato. */
  note: string | null;
  vacancy: Omit<VacancySummary, 'company'> & { deadline: string | null; status: string };
  company: { id: string; name: string };
  match: VacancyMatch;
}

/** Borrador del perfil leído de la HV por la IA: el candidato lo corrige antes de guardar. */
export interface CvDraft {
  professional_title: string | null;
  professional_summary: string | null;
  position: string | null;
  experience_years: number | null;
  location: string | null;
  phone: string | null;
  linkedin_url: string | null;
  experience: { company_name: string; role_title: string; start_date: string | null; end_date: string | null; description: string | null }[];
  education: { institution: string; degree: string; start_date: string | null; end_date: string | null }[];
  skills: { name: string; category: SkillCategory }[];
}

/** Oferta de otro sitio web: la postulación se hace en ese sitio. */
export interface ExternalJob {
  id: string;
  source: 'getonbrd' | 'google_jobs';
  source_label: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  published_at: string | null;
  salary: string | null;
  description: string;
  applied: boolean;
  match: VacancyMatch;
}

export interface ExternalJobsResult {
  query: string | null;
  sources: { source: ExternalJob['source']; ok: boolean; count: number; skipped?: 'presupuesto' }[];
  jobs: ExternalJob[];
  /** Cuándo se consultaron los portales (los resultados se guardan 24 h) */
  fetched_at?: string;
  /** Google Jobs (elempleo, Computrabajo, LinkedIn…) necesita SERPAPI_API_KEY en el backend. */
  google_enabled: boolean;
}

export type ExternalStatus = 'postulado' | 'en_proceso' | 'entrevista' | 'oferta' | 'no_seleccionado';

/** Registro propio de una postulación hecha en otro sitio (el estado lo actualiza el candidato). */
export interface ExternalApplication {
  id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  status: ExternalStatus;
  match_score: number | null;
  note: string | null;
  applied_at: string;
  status_changed_at: string | null;
}

export type JobSearchState = 'sin_respuesta' | 'en_proceso' | 'entrevista' | 'avanza' | 'no_continua';

export interface TrackedApp {
  kind: 'interna' | 'externa';
  id: string;
  title: string;
  company: string | null;
  source: string | null;
  state: JobSearchState;
  applied_at: string;
  changed_at: string | null;
  days_since_applied: number;
  match: number | null;
}

/** Tablero "Mi búsqueda" (backend/src/services/candidateDashboard.ts). */
export interface CandidateDashboard {
  searching_since: string | null;
  searching_days: number | null;
  last_applied_days: number | null;
  totals: { total: number; internal: number; external: number; last_7d: number; last_30d: number };
  by_state: Record<JobSearchState, number>;
  response_rate: number | null;
  avg_days_to_response: number | null;
  avg_match: number | null;
  weekly: { week_start: string; count: number }[];
  follow_up: TrackedApp[];
  recent_changes: TrackedApp[];
  external_enabled: boolean;
  profile_strength: ProfileStrength;
  has_cv: boolean;
}

/** Cómo ajustar la HV a una vacante (sin inventar experiencia). */
export interface CvAdvice {
  headline: string | null;
  summary: string | null;
  highlight: string[];
  keywords: string[];
  gaps: string[];
  tips: string[];
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

  async listApplications(): Promise<{ applications: MyApplication[]; notes_enabled: boolean }> {
    const res = await fetch('/api/me/applications', { headers: await authHeaders() });
    const data = await handle<{ applications: MyApplication[]; notes_enabled?: boolean }>(res, 'Error al cargar postulaciones');
    return { applications: data.applications ?? [], notes_enabled: data.notes_enabled !== false };
  },

  async updateApplicationNote(id: string, note: string | null): Promise<void> {
    const res = await fetch(`/api/me/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    await handle(res, 'No se pudo guardar la nota');
  },

  /** Vacantes abiertas ordenadas por ajuste a tu perfil. */
  async recommendations(): Promise<Recommendations> {
    const res = await fetch('/api/me/recommendations', { headers: await authHeaders() });
    return handle<Recommendations>(res, 'Error al cargar las vacantes recomendadas');
  },

  /** La IA lee la HV ya subida y devuelve un borrador (no guarda nada). */
  async extractCv(): Promise<CvDraft> {
    const res = await fetch('/api/me/cv/extract', { method: 'POST', headers: await authHeaders() });
    const data = await handle<{ draft: CvDraft }>(res, 'No pudimos leer tu hoja de vida');
    return data.draft;
  },

  /** Ofertas de otros sitios ordenadas por ajuste (q: búsqueda propia; sin q, la del perfil). */
  async externalJobs(q?: string): Promise<ExternalJobsResult> {
    const res = await fetch(`/api/me/external-jobs${q ? `?q=${encodeURIComponent(q)}` : ''}`, { headers: await authHeaders() });
    return handle<ExternalJobsResult>(res, 'Error al cargar ofertas de otros sitios');
  },

  async externalCvAdvice(jobId: string): Promise<{ match: VacancyMatch; advice: CvAdvice; profile_strength: ProfileStrength }> {
    const res = await fetch(`/api/me/external-jobs/${encodeURIComponent(jobId)}/advice`, { method: 'POST', headers: await authHeaders() });
    return handle(res, 'No pudimos generar los consejos');
  },

  async listExternalApplications(): Promise<{ applications: ExternalApplication[]; enabled: boolean }> {
    const res = await fetch('/api/me/external-applications', { headers: await authHeaders() });
    return handle(res, 'Error al cargar tus postulaciones en otros sitios');
  },

  /** Registra que se postuló en el otro sitio: desde una oferta mostrada (jobId) o a mano. */
  async addExternalApplication(input: { job_id: string } | { title: string; company?: string | null; url: string; source?: string | null }): Promise<ExternalApplication> {
    const res = await fetch('/api/me/external-applications', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<ExternalApplication>(res, 'No se pudo registrar la postulación');
  },

  async updateExternalApplication(id: string, patch: { status?: ExternalStatus; note?: string | null }): Promise<ExternalApplication> {
    const res = await fetch(`/api/me/external-applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return handle<ExternalApplication>(res, 'No se pudo actualizar la postulación');
  },

  async deleteExternalApplication(id: string): Promise<void> {
    const res = await fetch(`/api/me/external-applications/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'No se pudo eliminar');
    }
  },

  async dashboard(): Promise<CandidateDashboard> {
    const res = await fetch('/api/me/dashboard', { headers: await authHeaders() });
    return handle<CandidateDashboard>(res, 'Error al cargar tu tablero');
  },

  /** Consejos para ajustar la HV a una vacante. */
  async cvAdvice(vacancyId: string): Promise<{ match: VacancyMatch; advice: CvAdvice; profile_strength: ProfileStrength }> {
    const res = await fetch(`/api/me/vacancies/${encodeURIComponent(vacancyId)}/advice`, { method: 'POST', headers: await authHeaders() });
    return handle(res, 'No pudimos generar los consejos');
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

  async uploadCv(file: File): Promise<string> {
    if (file.size > MAX_CV_BYTES) {
      throw new Error('El archivo supera los 5 MB');
    }
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_CV_EXT.includes(ext)) {
      throw new Error(`Formato no permitido. Usa: ${ALLOWED_CV_EXT.join(', ')}`);
    }

    const res = await fetch('/api/me/cv', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const data = await handle<{ cv_url: string }>(res, 'Error al subir la hoja de vida');
    return data.cv_url;
  },

  /** Quita la HV del perfil y borra el archivo — no cambia los campos del perfil. */
  async deleteCv(): Promise<void> {
    const res = await fetch('/api/me/cv', { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al eliminar la hoja de vida');
    }
  },

  // ─── Experiencia laboral ─────────────────────────────────

  async listExperience(): Promise<ExperienceEntry[]> {
    const res = await fetch('/api/me/experience', { headers: await authHeaders() });
    const data = await handle<{ experience: ExperienceEntry[] }>(res, 'Error al cargar tu experiencia');
    return data.experience ?? [];
  },
  async addExperience(input: ExperienceInput): Promise<ExperienceEntry> {
    const res = await fetch('/api/me/experience', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<ExperienceEntry>(res, 'Error al guardar la experiencia');
  },
  async updateExperience(id: string, input: Partial<ExperienceInput>): Promise<ExperienceEntry> {
    const res = await fetch(`/api/me/experience/${id}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<ExperienceEntry>(res, 'Error al actualizar la experiencia');
  },
  async deleteExperience(id: string): Promise<void> {
    const res = await fetch(`/api/me/experience/${id}`, { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok && res.status !== 204) await handle(res, 'Error al eliminar la experiencia');
  },

  // ─── Formación académica ─────────────────────────────────

  async listEducation(): Promise<EducationEntry[]> {
    const res = await fetch('/api/me/education', { headers: await authHeaders() });
    const data = await handle<{ education: EducationEntry[] }>(res, 'Error al cargar tu formación');
    return data.education ?? [];
  },
  async addEducation(input: EducationInput): Promise<EducationEntry> {
    const res = await fetch('/api/me/education', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<EducationEntry>(res, 'Error al guardar la formación');
  },
  async updateEducation(id: string, input: Partial<EducationInput>): Promise<EducationEntry> {
    const res = await fetch(`/api/me/education/${id}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<EducationEntry>(res, 'Error al actualizar la formación');
  },
  async deleteEducation(id: string): Promise<void> {
    const res = await fetch(`/api/me/education/${id}`, { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok && res.status !== 204) await handle(res, 'Error al eliminar la formación');
  },

  // ─── Habilidades ──────────────────────────────────────────

  async listSkills(): Promise<SkillEntry[]> {
    const res = await fetch('/api/me/skills', { headers: await authHeaders() });
    const data = await handle<{ skills: SkillEntry[] }>(res, 'Error al cargar tus habilidades');
    return data.skills ?? [];
  },
  async addSkill(name: string, category: SkillCategory): Promise<SkillEntry> {
    const res = await fetch('/api/me/skills', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category }),
    });
    return handle<SkillEntry>(res, 'Error al guardar la habilidad');
  },
  async deleteSkill(id: string): Promise<void> {
    const res = await fetch(`/api/me/skills/${id}`, { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok && res.status !== 204) await handle(res, 'Error al eliminar la habilidad');
  },

  // ─── Preferencias de búsqueda / matching ─────────────────

  async getSearchPreferences(): Promise<SearchPreferences> {
    const res = await fetch('/api/me/search-preferences', { headers: await authHeaders() });
    return handle<SearchPreferences>(res, 'Error al cargar tus preferencias de búsqueda');
  },
  async updateSearchPreferences(input: Partial<SearchPreferences>): Promise<SearchPreferences> {
    const res = await fetch('/api/me/search-preferences', {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<SearchPreferences>(res, 'Error al guardar tus preferencias de búsqueda');
  },
};
