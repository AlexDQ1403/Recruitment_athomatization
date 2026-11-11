import type { InsightsData } from './insightsData';

/**
 * Reporte de resultados de la empresa para un rango de fechas: lo que se lleva a
 * gerencia. Responde "¿qué logró el equipo con cada vacante y cuánto tardó?".
 *
 * Cada número cuenta hechos ocurridos DENTRO del rango (encontrado, contactado,
 * presentado, decidido), no el estado actual. La excepción es `pending_now`,
 * que es una foto de hoy. La decisión de la empresa se guarda como
 * contratado/descartado, pero en pantalla es "autorizado para la siguiente fase".
 */

export interface ReportRange { from: Date; to: Date }

export interface VacancyReport {
  id: string;
  title: string;
  status: string;
  created_at: string;
  found: number;
  contacted: number;
  presented: number;
  authorized: number;
  discarded: number;
  /** Días desde que se abrió la vacante hasta el primer candidato presentado (de toda su historia). */
  days_to_first_presented: number | null;
}

export interface RecruiterReport {
  id: string;
  full_name: string;
  contacted: number;
  presented: number;
  authorized: number;
  discarded: number;
  /** Autorizados / decididos, de lo que presentó (null si la empresa no ha decidido sobre ninguno) */
  hit_rate: number | null;
}

export interface CompanyReport {
  range: { from: string; to: string };
  totals: {
    found: number;
    contacted: number;
    presented: number;
    authorized: number;
    discarded: number;
    avg_days_to_decide: number | null;
    avg_days_to_first_presented: number | null;
    pending_now: number;
  };
  vacancies: VacancyReport[];
  /** Encontrados y contactados que no están en ninguna vacante (resultados de búsquedas del chat). */
  unassigned: { found: number; contacted: number };
  discard_reasons: { reason: string; count: number }[];
  discarded_without_reason: number;
  recruiters: RecruiterReport[];
}

const DAY = 24 * 60 * 60 * 1000;
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function computeCompanyReport(data: InsightsData, range: ReportRange): CompanyReport {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= from && t <= to;
  };

  // Vacante de cada candidato: la ficha heredada tiene una; el de cuenta propia, la de su última postulación
  const latestApp = new Map<string, { vacancy_id: string; created_at: string }>();
  for (const a of data.applications) {
    const cur = latestApp.get(a.candidate_profile_id);
    if (!cur || a.created_at > cur.created_at) latestApp.set(a.candidate_profile_id, a);
  }
  const legacyVacancy = new Map(data.legacy.map((c) => [c.id, c.vacancy_id]));
  const vacancyOf = (r: { legacy_candidate_id: string | null; candidate_profile_id: string | null }) =>
    r.legacy_candidate_id ? legacyVacancy.get(r.legacy_candidate_id) ?? null
      : r.candidate_profile_id ? latestApp.get(r.candidate_profile_id)?.vacancy_id ?? null
      : null;
  const keyOf = (r: { legacy_candidate_id: string | null; candidate_profile_id: string | null }) =>
    r.legacy_candidate_id ? `l:${r.legacy_candidate_id}` : `p:${r.candidate_profile_id}`;

  const presented = data.bridges.filter((b) => b.presented_to_company);
  const decided = presented.filter((b) => (b.company_decision === 'contratado' || b.company_decision === 'descartado') && inRange(b.company_decided_at));
  const presentedInRange = presented.filter((b) => inRange(b.presented_at));
  const contactsInRange = data.contacts.filter((c) => inRange(c.created_at));

  // Encontrados: fichas creadas y postulaciones recibidas en el rango
  const found = [
    ...data.legacy.filter((c) => inRange(c.created_at)).map((c) => ({ vacancy: c.vacancy_id, key: `l:${c.id}` })),
    ...data.applications.filter((a) => inRange(a.created_at)).map((a) => ({ vacancy: a.vacancy_id as string | null, key: `p:${a.candidate_profile_id}` })),
  ];
  const distinct = <T>(xs: T[], key: (x: T) => string) => new Set(xs.map(key)).size;

  const daysToFirst = (vacancyId: string, createdAt: string) => {
    const times = presented.filter((b) => b.presented_at && vacancyOf(b) === vacancyId).map((b) => new Date(b.presented_at!).getTime());
    if (!times.length) return null;
    return Math.max(0, Math.round((Math.min(...times) - new Date(createdAt).getTime()) / DAY));
  };

  const vacancies: VacancyReport[] = data.vacancies.map((v) => {
    const mine = <T extends { legacy_candidate_id: string | null; candidate_profile_id: string | null }>(xs: T[]) => xs.filter((x) => vacancyOf(x) === v.id);
    const dec = mine(decided);
    return {
      id: v.id,
      title: v.title,
      status: v.status,
      created_at: v.created_at,
      found: distinct(found.filter((f) => f.vacancy === v.id), (f) => f.key),
      contacted: distinct(mine(contactsInRange), keyOf),
      presented: mine(presentedInRange).length,
      authorized: dec.filter((b) => b.company_decision === 'contratado').length,
      discarded: dec.filter((b) => b.company_decision === 'descartado').length,
      days_to_first_presented: daysToFirst(v.id, v.created_at),
    };
  })
    // Las cerradas sin movimiento en el rango no aportan; las activas siempre se listan
    .filter((v) => v.status === 'active' || v.found + v.contacted + v.presented + v.authorized + v.discarded > 0)
    .sort((a, b) => b.presented - a.presented || b.found - a.found || a.title.localeCompare(b.title));

  // Motivos de descarte: se agrupan los iguales (sin mayúsculas, tildes ni puntuación)
  const reasons = new Map<string, { reason: string; count: number }>();
  let withoutReason = 0;
  for (const b of decided.filter((d) => d.company_decision === 'descartado')) {
    const text = b.company_decision_reason?.trim();
    if (!text) { withoutReason++; continue; }
    const k = fold(text);
    const cur = reasons.get(k);
    if (cur) cur.count++;
    else reasons.set(k, { reason: text, count: 1 });
  }

  const recruiters: RecruiterReport[] = data.team.map((m) => {
    const dec = decided.filter((b) => b.presented_by === m.id);
    const authorized = dec.filter((b) => b.company_decision === 'contratado').length;
    return {
      id: m.id,
      full_name: m.full_name,
      contacted: distinct(contactsInRange.filter((c) => c.recruiter_id === m.id), keyOf),
      presented: presentedInRange.filter((b) => b.presented_by === m.id).length,
      authorized,
      discarded: dec.length - authorized,
      hit_rate: dec.length ? Math.round((authorized / dec.length) * 100) : null,
    };
  }).sort((a, b) => b.presented - a.presented || b.contacted - a.contacted || a.full_name.localeCompare(b.full_name));

  const firsts = vacancies.map((v) => v.days_to_first_presented).filter((d): d is number => d !== null);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      found: distinct(found, (f) => f.key),
      contacted: distinct(contactsInRange, keyOf),
      presented: presentedInRange.length,
      authorized: decided.filter((b) => b.company_decision === 'contratado').length,
      discarded: decided.filter((b) => b.company_decision === 'descartado').length,
      avg_days_to_decide: avg(decided
        .filter((b) => b.presented_at)
        .map((b) => (new Date(b.company_decided_at!).getTime() - new Date(b.presented_at!).getTime()) / DAY)
        .filter((d) => d >= 0)),
      avg_days_to_first_presented: avg(firsts),
      pending_now: presented.filter((b) => !b.company_decision || b.company_decision === 'pendiente').length,
    },
    vacancies,
    unassigned: {
      found: distinct(found.filter((f) => !f.vacancy), (f) => f.key),
      contacted: distinct(contactsInRange.filter((c) => !vacancyOf(c)), keyOf),
    },
    discard_reasons: [...reasons.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    discarded_without_reason: withoutReason,
    recruiters,
  };
}
