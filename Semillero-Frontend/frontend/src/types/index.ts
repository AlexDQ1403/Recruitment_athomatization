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

/** Decisión del reclutador sobre un candidato (ver specs/decisiones_candidato_design.md). */
export type CandidateDecision = 'aprobar' | 'seguimiento' | 'rechazar';

/** Estado vigente de un candidato: pipeline + si ya figura en la lista de aceptados de la empresa. */
export interface CandidateDecisionState {
  status: CandidateStatus;
  presented: boolean;
}

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

export type CandidateObservationCode =
  | 'experience_missing'
  | 'salary_missing'
  | 'location_missing'
  | 'experience_below'
  | 'salary_above'
  | 'location_mismatch'
  | 'unverified_profile';

export interface CandidateObservation {
  code: CandidateObservationCode;
  severity: 'warn' | 'info';
  found?: number | string;
  requested?: number | string;
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
  observations?: CandidateObservation[];
  fit?: 'full' | 'partial';
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

/** Decisión de la empresa sobre un candidato que le presentó un reclutador (independiente del pipeline). */
export type CompanyDecision = 'pendiente' | 'contratado' | 'descartado';

export const COMPANY_DECISION_LABELS: Record<CompanyDecision, string> = {
  pendiente: 'Por decidir',
  contratado: 'Contratado',
  descartado: 'Descartado',
};

/** Postulante de una vacante, con datos básicos. `kind` indica el origen (cuenta propia o ficha heredada). */
export interface VacancyApplicant {
  kind: 'profile' | 'legacy';
  id: string;
  full_name: string;
  title: string | null;
  location: string | null;
  experience_years: number | null;
  status: CandidateStatus;
  /** Aprobado por un reclutador (lo único que ve la empresa). */
  presented: boolean;
  company_decision: CompanyDecision;
  applied_at: string | null;
}
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

/**
 * Un proceso de selección tal como lo ve la Empresa: candidato presentado
 * por un reclutador, con la oferta y el estado del proceso. Nunca candidatos
 * sin aprobar — ver GET /api/company/candidates (migración 018).
 */
export interface CompanyCandidateProcess {
  /** Origen: candidato con cuenta propia o ficha heredada. Se usa para decidir sobre él. */
  kind: 'profile' | 'legacy';
  decision: CompanyDecision;
  decided_at: string | null;
  candidate: {
    id: string;
    full_name: string;
    position: string | null;
    location: string | null;
    experience_years: number | null;
  };
  recruiter: { id: string; full_name: string } | null;
  vacancy: { id: string; title: string } | null;
  presented_at: string | null;
  status: string;
  status_history: {
    from_status: string | null;
    to_status: string;
    changed_at: string;
    changed_by_name: string | null;
  }[];
}

/** Resumen del dashboard del reclutador (GET /api/dashboard/recruiter). */
export interface RecruiterDashboard {
  pipeline: Record<CandidateStatus, number>;
  total: number;
  /** Candidatos que el reclutador presentó a la empresa y siguen vigentes. */
  approved: number;
  /** Candidatos que la empresa contrató. */
  hired: number;
  vacancies: {
    active: number;
    paused: number;
    closed: number;
    applicants_active: number;
    top: { id: string; title: string; applicants: number }[];
  };
  recent: {
    kind: 'profile' | 'legacy';
    id: string;
    full_name: string;
    title: string | null;
    location: string | null;
    status: CandidateStatus;
    vacancy_title: string | null;
    created_at: string;
  }[];
}
