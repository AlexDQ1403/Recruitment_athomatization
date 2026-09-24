export type UserRole = 'superAdmin' | 'empresa' | 'recruiter' | 'candidato';

/** Estado de una postulación, visible para el candidato. */
export type ApplicationStatus = 'enviada' | 'en_revision' | 'descartada' | 'contactado';

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  enviada: 'Enviada',
  en_revision: 'En revisión',
  descartada: 'Descartada',
  contactado: 'Contactado',
};
export type CandidateStatus = 'rechazado' | 'en_contacto' | 'seguimiento';
export type CandidateSource = 'internal' | 'scraping' | 'applicant';

// Mapeos para display en UI
export const STATUS_LABELS: Record<CandidateStatus, string> = {
  'rechazado': 'Rechazado',
  'en_contacto': 'En Contacto',
  'seguimiento': 'Seguimiento',
};

export const SOURCE_LABELS: Record<CandidateSource, string> = {
  'internal': 'Interno',
  'scraping': 'Web Scraping',
  'applicant': 'Solicitante',
};

export interface Company {
  id: string;
  name: string;
  industry?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string;
  company?: Company;
}

export interface Candidate {
  id: string;
  company_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  position: string;
  experience_years?: number;
  expected_salary?: number;
  location?: string;
  status: CandidateStatus;
  source: CandidateSource;
  resume_url?: string;
  profile_url?: string;
  linkedin_url?: string;
  vacancy_id?: string;
  vacancy?: Vacancy;
  created_by?: string;
  created_at: string;
  updated_at: string;
  match_reason?: string;
  n8n_request_id?: string;
  n8n_search_date?: string;
}

export interface SearchHistory {
  id: string;
  company_id: string;
  user_id: string;
  query: string;
  candidates_found: number;
  created_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id?: string;
  role: 'user' | 'assistant';
  content: string;
  candidates?: Candidate[];
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export type VacancyStatus = 'active' | 'paused' | 'closed';
export type VacancyModality = 'presencial' | 'remoto' | 'híbrido';

export interface Vacancy {
  id: string;
  title: string;
  company: string;
  description?: string;
  location?: string;
  modality: VacancyModality;
  salary_min?: number;
  salary_max?: number;
  experience_years_min?: number;
  skills?: string[];
  status: VacancyStatus;
  created_by?: string;
  deadline?: string;
  created_at: string;
  updated_at: string;
  applicants_count?: number;
}

export interface CandidateNote {
  id: string;
  candidate_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: { full_name: string; email: string };
}

export interface StatusHistoryEntry {
  id: string;
  candidate_id: string;
  from_status: CandidateStatus | null;
  to_status: CandidateStatus;
  changed_by: string | null;
  changed_at: string;
  changer?: { full_name: string };
}
