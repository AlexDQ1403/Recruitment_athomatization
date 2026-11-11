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
  /** Vacante en la que está: aprobar o dar seguimiento la exigen. */
  vacancy_id?: string | null;
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
  avatar_url?: string | null;
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
  /** Origen en el chat: 'legacy' (scraping o alta manual) o 'profile' (cuenta propia). Mensajes viejos no lo traen. */
  kind?: CandidateKind;
  /** Titular profesional o de LinkedIn. */
  headline?: string | null;
  match_reason?: string;
  /** 0–100: afinidad con lo que pidió el reclutador (no es probabilidad de aceptación). */
  affinity?: number;
  affinity_parts?: AffinityPart[];
  /** Cargo que entendió el chat en esa búsqueda: prellena el puesto al rechazar. */
  matched_role?: string;
  /** Puestos para los que ya se rechazó (sigue siendo elegible para este). */
  rejected_for?: { role: string; reason: string | null }[];
  observations?: CandidateObservation[];
  fit?: 'full' | 'partial';
  n8n_request_id?: string;
  n8n_search_date?: string;
}

export type CandidateKind = 'legacy' | 'profile';

/** Un factor de la afinidad (ver backend/src/services/affinity.ts). */
export interface AffinityPart {
  factor: 'cargo' | 'experiencia' | 'salario' | 'ubicacion';
  /** 0–1 */
  score: number;
  weight: number;
  missing?: boolean;
}

export type ContactChannel = 'whatsapp' | 'email' | 'linkedin';

/** Rechazo para un puesto concreto (no excluye al candidato de otros puestos). */
export interface CandidateRejection {
  id: string;
  kind: CandidateKind;
  candidate_id: string;
  role_label: string;
  role_key: string;
  vacancy_id: string | null;
  reason: string | null;
  created_at: string;
}

/** Perfil completo con datos de contacto (GET /api/candidate-profiles/:kind/:id, solo reclutadores). */
export interface CandidateProfileDetail {
  kind: CandidateKind;
  id: string;
  full_name: string;
  position: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  experience_years: number | null;
  expected_salary: number | null;
  source: CandidateSource;
  status: CandidateStatus;
  resume_url: string | null;
  profile_url: string | null;
  /** phone ya viene en formato internacional (+57…) o null. */
  contact: { email: string | null; phone: string | null; linkedin_url: string | null };
  experience: { company_name: string; role_title: string; start_date: string; end_date: string | null; description: string | null }[];
  education: { institution: string; degree: string; start_date: string | null; end_date: string | null }[];
  skills: { name: string; category: string }[];
  last_contact: { channel: ContactChannel; created_at: string } | null;
  rejections: CandidateRejection[];
  sender: { recruiter_name: string | null; company_name: string | null };
  /** Presentación a la empresa (null si no se ha presentado). */
  presentation?: {
    presented: boolean;
    presented_at: string | null;
    presented_by: string | null;
    vacancy_title: string | null;
    company_decision: CompanyDecision | null;
    decision_reason: string | null;
  } | null;
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
  contratado: 'Autorizado',
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

/** Dashboard del reclutador orientado a decisiones (GET /api/dashboard/recruiter). */
export type DashboardPeriod = '7d' | '30d' | '90d' | 'all';

export interface DashboardFilters {
  period: DashboardPeriod;
  vacancyId?: string;
  source?: CandidateSource;
}

export interface DashboardFunnel {
  candidates: number;
  /** Contactados de verdad (WhatsApp/correo/LinkedIn desde la plataforma) o en estado "en contacto". */
  contacted: number;
  approved: number;
  hired: number;
  rejected: number;
}

export interface DashboardActionItem {
  kind: CandidateKind;
  id: string;
  full_name: string;
  title: string | null;
  vacancy_title: string | null;
  /** Días desde el hecho que motiva la acción. */
  days: number;
}

export type VacancyAlert = 'sin_candidatos' | 'sin_contactar' | 'sin_aprobados' | 'vence_pronto' | 'vencida';

export interface RecruiterDashboard {
  filters: { period: DashboardPeriod; vacancyId?: string; source?: CandidateSource };
  funnel: DashboardFunnel;
  actions: {
    follow_up: { total: number; items: DashboardActionItem[] };
    new_applicants: { total: number; items: DashboardActionItem[] };
    awaiting_company: { total: number; items: DashboardActionItem[] };
  };
  vacancies: {
    id: string; title: string; days_open: number; deadline_days: number | null;
    candidates: number; contacted: number; approved: number; hired: number; alert: VacancyAlert | null;
  }[];
  sources: ({ source: CandidateSource } & Omit<DashboardFunnel, 'rejected'>)[];
  vacancy_options: { id: string; title: string; status: VacancyStatus }[];
  /** Quién está en qué etapa de qué vacante. */
  pipeline: { counts: Record<PipelineStage, number>; total: number; rows: PipelineRow[] };
}

/** Etapa de un candidato EN una vacante (o sin vacante, si salió de una búsqueda). */
export type PipelineStage =
  | 'sin_revisar' | 'seguimiento' | 'contactado' | 'aprobado' | 'contratado'
  | 'descartado_empresa' | 'rechazado' | 'sin_vacante';

export interface PipelineRow {
  kind: CandidateKind;
  id: string;
  full_name: string;
  title: string | null;
  source: CandidateSource;
  vacancy_id: string | null;
  vacancy_title: string | null;
  stage: PipelineStage;
  /** Último movimiento: qué pasó, cuándo y quién. */
  event: { label: string; at: string | null; by: string | null; reason: string | null };
  days: number | null;
  next_action: string | null;
}

/** Dashboard de la empresa (GET /api/company/dashboard). */
export interface CompanyTeamMember {
  id: string;
  full_name: string;
  last_login: string | null;
  suspended: boolean;
  /** Contactos registrados en los últimos 30 días */
  contacted_30d: number;
  presented: number;
  hired: number;
  /** % de presentados que la empresa autorizó para la siguiente fase (null si no ha presentado a nadie) */
  hire_rate: number | null;
}

export interface CompanyDashboard {
  kpis: {
    pending: number;
    oldest_pending_days: number | null;
    hired: number;
    discarded: number;
    avg_days_to_decide: number | null;
    active_vacancies: number;
  };
  pending: PipelineRow[];
  recent_decisions: PipelineRow[];
  vacancies: RecruiterDashboard['vacancies'];
  team: CompanyTeamMember[];
}
