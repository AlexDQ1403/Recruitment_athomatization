/** Dashboard del reclutador orientado a decisiones (ver routes/dashboard.ts) */

import { searchTerms } from './searchTerms';
import { sameRole } from './rejections';

export type Period = '7d' | '30d' | '90d' | 'all';
export type Source = 'scraping' | 'applicant' | 'internal';
type Kind = 'legacy' | 'profile';

export interface InsightsFilters {
  period: Period;
  vacancyId?: string;
  source?: Source;
}

export interface InsightsInput {
  now: Date;
  legacy: { id: string; full_name: string; position: string | null; source: string; status: string; vacancy_id: string | null; created_at: string }[];
  bridges: {
    legacy_candidate_id: string | null; candidate_profile_id: string | null; status: string; source: string;
    presented_to_company: boolean | null; presented_at: string | null; company_decision?: string | null; created_at: string;
    presented_by?: string | null; company_decided_at?: string | null; company_decision_reason?: string | null;
  }[];
  applications: { candidate_profile_id: string; vacancy_id: string; status: string; created_at: string }[];
  profiles: { id: string; full_name: string; title: string | null }[];
  contacts: { legacy_candidate_id: string | null; candidate_profile_id: string | null; created_at: string; channel?: string; recruiter_id?: string | null }[];
  rejections: {
    legacy_candidate_id: string | null; candidate_profile_id: string | null;
    role_label?: string; role_key?: string; vacancy_id?: string | null; reason?: string | null; rejected_by?: string | null; created_at?: string;
  }[];
  vacancies: { id: string; title: string; status: string; created_at: string; deadline: string | null }[];
  /** Nombres de quienes aprobaron, contactaron o rechazaron (para "quién hizo qué"). */
  recruiters?: { id: string; full_name: string }[];
}

export interface ActionItem {
  kind: Kind;
  id: string;
  full_name: string;
  title: string | null;
  vacancy_title: string | null;
  /** Días desde el hecho que motiva la acción (último contacto, postulación, aprobación). */
  days: number;
}

export type VacancyAlert = 'sin_candidatos' | 'sin_contactar' | 'sin_aprobados' | 'vence_pronto' | 'vencida';

export interface VacancyHealth {
  id: string;
  title: string;
  days_open: number;
  /** Días que faltan para la fecha límite (negativo = vencida); null sin fecha. */
  deadline_days: number | null;
  candidates: number;
  contacted: number;
  approved: number;
  hired: number;
  alert: VacancyAlert | null;
}

export interface Funnel { candidates: number; contacted: number; approved: number; hired: number; rejected: number }

/** Etapa de un candidato EN una vacante (o sin vacante, si salió de una búsqueda). */
export type Stage =
  | 'sin_revisar' | 'seguimiento' | 'contactado' | 'aprobado' | 'contratado'
  | 'descartado_empresa' | 'rechazado' | 'sin_vacante';

export const STAGES: Stage[] = ['sin_revisar', 'sin_vacante', 'seguimiento', 'contactado', 'aprobado', 'contratado', 'descartado_empresa', 'rechazado'];

export interface PipelineRow {
  kind: Kind;
  id: string;
  full_name: string;
  title: string | null;
  source: Source;
  vacancy_id: string | null;
  vacancy_title: string | null;
  stage: Stage;
  /** Último movimiento: qué pasó, cuándo y quién (null si no se sabe). */
  event: { label: string; at: string | null; by: string | null; reason: string | null };
  days: number | null;
  next_action: string | null;
}

export interface RecruiterInsights {
  filters: InsightsFilters;
  funnel: Funnel;
  actions: {
    follow_up: { total: number; items: ActionItem[] };
    new_applicants: { total: number; items: ActionItem[] };
    awaiting_company: { total: number; items: ActionItem[] };
  };
  vacancies: VacancyHealth[];
  sources: ({ source: Source } & Omit<Funnel, 'rejected'>)[];
  vacancy_options: { id: string; title: string; status: string }[];
  /** Quién está en qué etapa de qué vacante (tope MAX_ROWS, los movimientos más recientes primero). */
  pipeline: { counts: Record<Stage, number>; total: number; rows: PipelineRow[] };
}

// Reglas de "qué hacer hoy" (días)
export const FOLLOW_UP_AFTER_DAYS = 3;
export const COMPANY_REMINDER_AFTER_DAYS = 5;
const VACANCY_GRACE_DAYS = 3;
const DEADLINE_SOON_DAYS = 7;
const NO_APPROVED_MIN_CANDIDATES = 5;
const MAX_ITEMS = 8;
const MAX_ROWS = 300;

const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };
const SOURCES: Source[] = ['scraping', 'applicant', 'internal'];
const DAY = 24 * 60 * 60 * 1000;

interface Person {
  kind: Kind;
  id: string;
  full_name: string;
  title: string | null;
  source: Source;
  status: string;
  created_at: string;
  vacancyIds: string[];
  presented: boolean;
  presented_at: string | null;
  decision: string;
  contacts: number;
  last_contact: string | null;
  last_contact_channel: string | null;
  last_contact_by: string | null;
  presented_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  rejected: boolean;
  rejections: InsightsInput['rejections'];
  applications: InsightsInput['applications'];
}

const asSource = (s: string | null | undefined): Source => (SOURCES.includes(s as Source) ? (s as Source) : 'internal');

function people(input: InsightsInput): Person[] {
  const key = (kind: Kind, id: string) => `${kind}:${id}`;
  const bridgeBy = new Map<string, InsightsInput['bridges'][number]>();
  for (const b of input.bridges) {
    if (b.legacy_candidate_id) bridgeBy.set(key('legacy', b.legacy_candidate_id), b);
    if (b.candidate_profile_id) bridgeBy.set(key('profile', b.candidate_profile_id), b);
  }
  const contactBy = new Map<string, { n: number; last: InsightsInput['contacts'][number] }>();
  for (const c of input.contacts) {
    const k = c.legacy_candidate_id ? key('legacy', c.legacy_candidate_id) : c.candidate_profile_id ? key('profile', c.candidate_profile_id) : null;
    if (!k) continue;
    const prev = contactBy.get(k);
    contactBy.set(k, { n: (prev?.n ?? 0) + 1, last: !prev || c.created_at > prev.last.created_at ? c : prev.last });
  }
  const rejectionsBy = new Map<string, InsightsInput['rejections']>();
  for (const r of input.rejections) {
    const k = r.legacy_candidate_id ? key('legacy', r.legacy_candidate_id) : key('profile', r.candidate_profile_id ?? '');
    if (!rejectionsBy.has(k)) rejectionsBy.set(k, []);
    rejectionsBy.get(k)!.push(r);
  }
  const appsBy = new Map<string, InsightsInput['applications']>();
  for (const a of input.applications) {
    if (!appsBy.has(a.candidate_profile_id)) appsBy.set(a.candidate_profile_id, []);
    appsBy.get(a.candidate_profile_id)!.push(a);
  }

  const out: Person[] = [];
  const build = (kind: Kind, id: string, base: Pick<Person, 'full_name' | 'title' | 'created_at' | 'vacancyIds'> & { source: string; status: string }) => {
    const k = key(kind, id);
    const b = bridgeBy.get(k);
    const contact = contactBy.get(k);
    const status = b?.status ?? base.status;
    const rejections = rejectionsBy.get(k) ?? [];
    out.push({
      kind, id, ...base,
      source: asSource(b?.source ?? base.source),
      status,
      presented: b?.presented_to_company === true,
      presented_at: b?.presented_at ?? null,
      decision: b?.company_decision ?? 'pendiente',
      contacts: contact?.n ?? 0,
      last_contact: contact?.last.created_at ?? null,
      last_contact_channel: contact?.last.channel ?? null,
      last_contact_by: contact?.last.recruiter_id ?? null,
      presented_by: b?.presented_by ?? null,
      decided_at: b?.company_decided_at ?? null,
      decision_reason: b?.company_decision_reason ?? null,
      rejected: status === 'rechazado' || rejections.length > 0,
      rejections,
      applications: kind === 'profile' ? appsBy.get(id) ?? [] : [],
    });
  };

  for (const c of input.legacy) {
    build('legacy', c.id, {
      full_name: c.full_name, title: c.position || null, created_at: c.created_at,
      vacancyIds: c.vacancy_id ? [c.vacancy_id] : [], source: c.source, status: c.status,
    });
  }

  // Con cuenta: quien se postuló o está en la relación empresa↔candidato
  const profileIds = new Set<string>([
    ...input.applications.map((a) => a.candidate_profile_id),
    ...input.bridges.map((b) => b.candidate_profile_id).filter((id): id is string => !!id),
  ]);
  const profileBy = new Map(input.profiles.map((p) => [p.id, p]));
  for (const id of profileIds) {
    const apps = appsBy.get(id) ?? [];
    const b = bridgeBy.get(key('profile', id));
    const dates = [...apps.map((a) => a.created_at), ...(b ? [b.created_at] : [])].sort();
    const p = profileBy.get(id);
    build('profile', id, {
      full_name: p?.full_name ?? 'Candidato', title: p?.title ?? null, created_at: dates[0] ?? input.now.toISOString(),
      vacancyIds: [...new Set(apps.map((a) => a.vacancy_id))], source: 'applicant', status: 'seguimiento',
    });
  }
  return out;
}

const daysSince = (now: Date, iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);

/** Días calendario hasta una fecha AAAA-MM-DD, contados desde hoy */
const calendarDaysUntil = (now: Date, date: string) => {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // AAAA-MM-DD
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
};
const isContacted = (p: Person) => p.contacts > 0 || p.status === 'en_contacto';
// Un rechazo por puesto no anula una aprobación para otra vacante; el global antiguo sí
const isApproved = (p: Person) => p.presented && p.status !== 'rechazado';
const isHired = (p: Person) => p.presented && p.decision === 'contratado';

const funnelOf = (list: Person[]): Funnel => ({
  candidates: list.length,
  contacted: list.filter(isContacted).length,
  approved: list.filter(isApproved).length,
  hired: list.filter(isHired).length,
  rejected: list.filter((p) => p.rejected).length,
});

export function computeInsights(input: InsightsInput, filters: InsightsFilters): RecruiterInsights {
  const { now } = input;
  const vacancyTitle = new Map(input.vacancies.map((v) => [v.id, v.title]));
  const all = people(input);

  // Vacante y origen aplican a todo
  const scoped = all.filter((p) =>
    (!filters.source || p.source === filters.source) &&
    (!filters.vacancyId || p.vacancyIds.includes(filters.vacancyId)));
  const days = PERIOD_DAYS[filters.period];
  const inPeriod = days === null ? scoped : scoped.filter((p) => daysSince(now, p.created_at) < days);

  const item = (p: Person, since: string, vacancyId?: string): ActionItem => ({
    kind: p.kind, id: p.id, full_name: p.full_name, title: p.title,
    vacancy_title: (vacancyId ?? p.vacancyIds[0]) ? vacancyTitle.get((vacancyId ?? p.vacancyIds[0])!) ?? null : null,
    days: daysSince(now, since),
  });
  const top = (items: ActionItem[]) => ({ total: items.length, items: items.sort((a, b) => b.days - a.days).slice(0, MAX_ITEMS) });

  // Contactados hace días que no avanzaron: recontactar o decidir
  const followUp = scoped
    .filter((p) => p.last_contact && !p.rejected && !p.presented && daysSince(now, p.last_contact) >= FOLLOW_UP_AFTER_DAYS)
    .map((p) => item(p, p.last_contact!));

  // Postulaciones que nadie ha mirado (la postulación sigue 'enviada')
  const scopedProfiles = new Map(scoped.filter((p) => p.kind === 'profile').map((p) => [p.id, p]));
  const newApplicants = input.applications
    .filter((a) => a.status === 'enviada' && scopedProfiles.has(a.candidate_profile_id) && !scopedProfiles.get(a.candidate_profile_id)!.rejected)
    .filter((a) => !filters.vacancyId || a.vacancy_id === filters.vacancyId)
    .map((a) => item(scopedProfiles.get(a.candidate_profile_id)!, a.created_at, a.vacancy_id));

  // Aprobados que la empresa no decide
  const awaitingCompany = scoped
    .filter((p) => isApproved(p) && p.decision === 'pendiente' && p.presented_at && daysSince(now, p.presented_at) >= COMPANY_REMINDER_AFTER_DAYS)
    .map((p) => item(p, p.presented_at!));

  // Salud de las vacantes activas
  const vacancies: VacancyHealth[] = input.vacancies
    .filter((v) => v.status === 'active' && (!filters.vacancyId || v.id === filters.vacancyId))
    .map((v) => {
      const f = funnelOf(scoped.filter((p) => p.vacancyIds.includes(v.id)));
      const daysOpen = daysSince(now, v.created_at);
      const deadlineDays = v.deadline ? calendarDaysUntil(now, v.deadline) : null;
      const alert: VacancyAlert | null =
        deadlineDays !== null && deadlineDays < 0 && f.hired === 0 ? 'vencida'
        : f.candidates === 0 && daysOpen >= VACANCY_GRACE_DAYS ? 'sin_candidatos'
        : deadlineDays !== null && deadlineDays <= DEADLINE_SOON_DAYS && f.hired === 0 ? 'vence_pronto'
        : f.candidates > 0 && f.contacted === 0 && daysOpen >= VACANCY_GRACE_DAYS ? 'sin_contactar'
        : f.candidates >= NO_APPROVED_MIN_CANDIDATES && f.approved === 0 ? 'sin_aprobados'
        : null;
      return { id: v.id, title: v.title, days_open: daysOpen, deadline_days: deadlineDays, ...f, alert };
    });
  const ALERT_ORDER: (VacancyAlert | null)[] = ['vencida', 'sin_candidatos', 'vence_pronto', 'sin_contactar', 'sin_aprobados', null];
  vacancies.sort((a, b) => ALERT_ORDER.indexOf(a.alert) - ALERT_ORDER.indexOf(b.alert) || b.days_open - a.days_open);

  const sources = SOURCES.map((source) => {
    const { rejected: _rejected, ...f } = funnelOf(inPeriod.filter((p) => p.source === source));
    return { source, ...f };
  }).filter((s) => s.candidates > 0);

  return {
    filters,
    funnel: funnelOf(inPeriod),
    actions: {
      follow_up: top(followUp),
      new_applicants: top(newApplicants),
      awaiting_company: top(awaitingCompany),
    },
    vacancies,
    sources,
    vacancy_options: input.vacancies
      .filter((v) => v.status !== 'closed')
      .map((v) => ({ id: v.id, title: v.title, status: v.status })),
    pipeline: pipelineOf(scoped, input, filters),
  };
}

const CHANNEL_LABELS: Record<string, string> = { whatsapp: 'WhatsApp', email: 'correo', linkedin: 'LinkedIn' };

function pipelineOf(scoped: Person[], input: InsightsInput, filters: InsightsFilters): RecruiterInsights['pipeline'] {
  const { now } = input;
  const vacancyBy = new Map(input.vacancies.map((v) => [v.id, v]));
  const nameOf = new Map((input.recruiters ?? []).map((r) => [r.id, r.full_name]));
  const who = (id: string | null | undefined) => (id ? nameOf.get(id) ?? null : null);
  const days = PERIOD_DAYS[filters.period];

  const rows: PipelineRow[] = [];
  for (const p of scoped) {
    const vacancyIds = filters.vacancyId ? p.vacancyIds.filter((v) => v === filters.vacancyId) : p.vacancyIds;
    const targets: (string | null)[] = vacancyIds.length ? vacancyIds : filters.vacancyId ? [] : [null];

    for (const vacancyId of targets) {
      const vacancy = vacancyId ? vacancyBy.get(vacancyId) : undefined;
      const vacancyStems = vacancy ? searchTerms(vacancy.title) : [];
      // Rechazo que aplica a ESTA fila: el de la vacante, o uno por puesto del mismo cargo
      const rejection = p.rejections.find((r) => !vacancyId
        || r.vacancy_id === vacancyId
        || (!r.vacancy_id && !!r.role_key && sameRole(r.role_key.split(' ').filter(Boolean), vacancyStems)));
      const app = p.applications.find((a) => a.vacancy_id === vacancyId);

      let stage: Stage;
      let event: PipelineRow['event'];
      if (p.status === 'rechazado') {
        stage = 'rechazado';
        event = { label: 'Descartado para todo (antes de los rechazos por puesto)', at: null, by: null, reason: null };
      } else if (rejection) {
        stage = 'rechazado';
        event = { label: `Rechazado para «${rejection.role_label ?? vacancy?.title ?? 'el puesto'}»`, at: rejection.created_at ?? null, by: who(rejection.rejected_by), reason: rejection.reason ?? null };
      } else if (p.presented && p.decision === 'contratado') {
        stage = 'contratado';
        event = { label: 'La empresa lo autorizó para la siguiente fase', at: p.decided_at, by: null, reason: p.decision_reason };
      } else if (p.presented && p.decision === 'descartado') {
        stage = 'descartado_empresa';
        event = { label: 'La empresa lo descartó', at: p.decided_at, by: null, reason: p.decision_reason };
      } else if (p.presented) {
        stage = 'aprobado';
        event = { label: 'Aprobado para la empresa', at: p.presented_at, by: who(p.presented_by), reason: null };
      } else if (p.contacts > 0) {
        stage = 'contactado';
        event = { label: `Contactado por ${CHANNEL_LABELS[p.last_contact_channel ?? ''] ?? 'la plataforma'}`, at: p.last_contact, by: who(p.last_contact_by), reason: null };
      } else if (p.status === 'en_contacto') {
        stage = 'contactado';
        event = { label: 'En contacto (entrevista)', at: null, by: null, reason: null };
      } else if (app?.status === 'enviada') {
        stage = 'sin_revisar';
        event = { label: 'Se postuló', at: app.created_at, by: null, reason: null };
      } else if (vacancyId) {
        stage = 'seguimiento';
        event = { label: app ? 'Se postuló' : 'Agregado a la vacante', at: app?.created_at ?? p.created_at, by: null, reason: null };
      } else {
        stage = 'sin_vacante';
        event = { label: 'Encontrado en una búsqueda', at: p.created_at, by: null, reason: null };
      }

      // El periodo filtra por el último movimiento (o por cuándo llegó, si no hay fecha)
      if (days !== null && daysSince(now, event.at ?? p.created_at) >= days) continue;

      const since = event.at ? daysSince(now, event.at) : null;
      const next_action =
        stage === 'sin_revisar' ? 'Revisar su hoja de vida'
        : stage === 'sin_vacante' ? 'Asociarlo a una vacante'
        : stage === 'seguimiento' ? 'Contactar'
        : stage === 'contactado' ? (since !== null && since >= FOLLOW_UP_AFTER_DAYS ? 'Recontactar o decidir' : 'Esperar respuesta')
        : stage === 'aprobado' ? (since !== null && since >= COMPANY_REMINDER_AFTER_DAYS ? 'Recordar a la empresa' : 'Esperar decisión de la empresa')
        : null;

      rows.push({
        kind: p.kind, id: p.id, full_name: p.full_name, title: p.title, source: p.source,
        vacancy_id: vacancyId, vacancy_title: vacancy?.title ?? null,
        stage, event, days: since, next_action,
      });
    }
  }

  const counts = Object.fromEntries(STAGES.map((st) => [st, 0])) as Record<Stage, number>;
  for (const r of rows) counts[r.stage]++;
  rows.sort((a, b) => String(b.event.at ?? '').localeCompare(String(a.event.at ?? '')));
  return { counts, total: rows.length, rows: rows.slice(0, MAX_ROWS) };
}
