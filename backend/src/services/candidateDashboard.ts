/**
 * Tablero "Mi búsqueda" del candidato: cuánto lleva buscando, cuántas
 * postulaciones ha enviado y cuándo, cuáles cambiaron de estado y cuáles siguen
 * sin respuesta. Junta las postulaciones de la plataforma con las de otros
 * sitios (que el candidato actualiza a mano) en un mismo lenguaje de estados.
 */

export type JobSearchState = 'sin_respuesta' | 'en_proceso' | 'entrevista' | 'avanza' | 'no_continua';

export interface InternalApp {
  id: string;
  title: string;
  company: string;
  /** Etapa contada al candidato (ver stageOf en routes/candidate-portal.ts). */
  stage: 'enviada' | 'en_revision' | 'contactado' | 'preseleccionado' | 'siguiente_fase' | 'no_continua';
  created_at: string;
  updated_at: string;
  match: number | null;
}

export interface ExternalApp {
  id: string;
  title: string;
  company: string | null;
  source: string;
  status: 'postulado' | 'en_proceso' | 'entrevista' | 'oferta' | 'no_seleccionado';
  applied_at: string;
  status_changed_at: string | null;
  match_score: number | null;
}

export interface TrackedApp {
  kind: 'interna' | 'externa';
  id: string;
  title: string;
  company: string | null;
  source: string | null;
  state: JobSearchState;
  applied_at: string;
  /** Último cambio de estado (null si sigue como la envió). */
  changed_at: string | null;
  days_since_applied: number;
  match: number | null;
}

export interface CandidateDashboard {
  searching_since: string | null;
  searching_days: number | null;
  last_applied_days: number | null;
  totals: { total: number; internal: number; external: number; last_7d: number; last_30d: number };
  by_state: Record<JobSearchState, number>;
  /** % de postulaciones que tuvieron alguna respuesta (cambiaron de estado). */
  response_rate: number | null;
  avg_days_to_response: number | null;
  avg_match: number | null;
  /** Postulaciones por semana (lunes a domingo), de la más antigua a la actual. */
  weekly: { week_start: string; count: number }[];
  /** Sin respuesta hace tiempo: conviene hacer seguimiento. */
  follow_up: TrackedApp[];
  recent_changes: TrackedApp[];
}

const DAY = 24 * 60 * 60 * 1000;
const COLOMBIA_OFFSET = 5 * 60 * 60 * 1000;
export const FOLLOW_UP_AFTER_DAYS = 10;
const RECENT_CHANGE_DAYS = 14;
const WEEKS = 8;

const INTERNAL_STATE: Record<InternalApp['stage'], JobSearchState> = {
  enviada: 'sin_respuesta',
  en_revision: 'en_proceso',
  contactado: 'en_proceso',
  preseleccionado: 'en_proceso',
  siguiente_fase: 'avanza',
  no_continua: 'no_continua',
};
const EXTERNAL_STATE: Record<ExternalApp['status'], JobSearchState> = {
  postulado: 'sin_respuesta',
  en_proceso: 'en_proceso',
  entrevista: 'entrevista',
  oferta: 'avanza',
  no_seleccionado: 'no_continua',
};

const daysBetween = (from: string, to: Date) => Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / DAY));

/** Lunes (hora de Colombia) de la semana de la fecha, como 'YYYY-MM-DD'. */
function weekStart(t: number): string {
  const local = new Date(t - COLOMBIA_OFFSET);
  const dow = (local.getUTCDay() + 6) % 7; // lunes = 0
  local.setUTCDate(local.getUTCDate() - dow);
  return local.toISOString().slice(0, 10);
}

export function computeCandidateDashboard(
  data: { internal: InternalApp[]; external: ExternalApp[]; profile_created_at: string | null; now: Date }
): CandidateDashboard {
  const { now } = data;
  const apps: TrackedApp[] = [
    ...data.internal.map((a) => {
      const state = INTERNAL_STATE[a.stage];
      return {
        kind: 'interna' as const, id: a.id, title: a.title, company: a.company, source: null, state,
        applied_at: a.created_at,
        changed_at: state === 'sin_respuesta' ? null : a.updated_at,
        days_since_applied: daysBetween(a.created_at, now),
        match: a.match,
      };
    }),
    ...data.external.map((a) => ({
      kind: 'externa' as const, id: a.id, title: a.title, company: a.company, source: a.source,
      state: EXTERNAL_STATE[a.status],
      applied_at: a.applied_at,
      changed_at: a.status === 'postulado' ? null : a.status_changed_at,
      days_since_applied: daysBetween(a.applied_at, now),
      match: a.match_score,
    })),
  ];

  const by_state: Record<JobSearchState, number> = { sin_respuesta: 0, en_proceso: 0, entrevista: 0, avanza: 0, no_continua: 0 };
  for (const a of apps) by_state[a.state]++;

  const appliedTimes = apps.map((a) => new Date(a.applied_at).getTime());
  const first = appliedTimes.length ? new Date(Math.min(...appliedTimes)).toISOString() : data.profile_created_at;
  const last = appliedTimes.length ? Math.max(...appliedTimes) : null;

  const responded = apps.filter((a) => a.state !== 'sin_respuesta');
  const responseDays = responded
    .filter((a) => a.changed_at)
    .map((a) => (new Date(a.changed_at!).getTime() - new Date(a.applied_at).getTime()) / DAY)
    .filter((d) => d >= 0);
  const matches = apps.map((a) => a.match).filter((m): m is number => m !== null);

  // Semanas: de hace 7 semanas a la actual, aunque estén vacías (el hueco también dice algo)
  const thisWeek = weekStart(now.getTime());
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(`${thisWeek}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 7 * (WEEKS - 1 - i));
    return { week_start: start.toISOString().slice(0, 10), count: 0 };
  });
  for (const t of appliedTimes) {
    const w = weekly.find((x) => x.week_start === weekStart(t));
    if (w) w.count++;
  }

  return {
    searching_since: first,
    searching_days: first ? daysBetween(first, now) : null,
    last_applied_days: last !== null ? Math.floor((now.getTime() - last) / DAY) : null,
    totals: {
      total: apps.length,
      internal: data.internal.length,
      external: data.external.length,
      last_7d: appliedTimes.filter((t) => now.getTime() - t <= 7 * DAY).length,
      last_30d: appliedTimes.filter((t) => now.getTime() - t <= 30 * DAY).length,
    },
    by_state,
    response_rate: apps.length ? Math.round((responded.length / apps.length) * 100) : null,
    avg_days_to_response: responseDays.length ? Math.round((responseDays.reduce((a, b) => a + b, 0) / responseDays.length) * 10) / 10 : null,
    avg_match: matches.length ? Math.round(matches.reduce((a, b) => a + b, 0) / matches.length) : null,
    weekly,
    follow_up: apps
      .filter((a) => a.state === 'sin_respuesta' && a.days_since_applied >= FOLLOW_UP_AFTER_DAYS)
      .sort((a, b) => b.days_since_applied - a.days_since_applied),
    recent_changes: apps
      .filter((a) => a.changed_at && now.getTime() - new Date(a.changed_at).getTime() <= RECENT_CHANGE_DAYS * DAY)
      .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at))),
  };
}
