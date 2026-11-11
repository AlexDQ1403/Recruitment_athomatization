import { computeInsights, type PipelineRow, type VacancyHealth } from './recruiterInsights';
import type { InsightsData } from './insightsData';

/**
 * Dashboard de la EMPRESA (no del reclutador): qué decisiones le tocan, cómo van
 * sus vacantes y qué está haciendo su equipo de reclutamiento.
 *
 * Reutiliza las reglas del dashboard del reclutador (salud de vacantes, etapa de
 * cada candidato) para que ambos vean los mismos números.
 */

export interface TeamMember {
  id: string;
  full_name: string;
  last_login: string | null;
  suspended: boolean;
  /** Últimos 30 días */
  contacted_30d: number;
  /** Candidatos presentados a la empresa (histórico) */
  presented: number;
  hired: number;
  /** Contratados / presentados (null si no ha presentado a nadie) */
  hire_rate: number | null;
}

export interface CompanyInsights {
  kpis: {
    pending: number;
    /** Días que lleva esperando el candidato más antiguo sin respuesta */
    oldest_pending_days: number | null;
    hired: number;
    discarded: number;
    /** Promedio de días entre la presentación y la decisión de la empresa */
    avg_days_to_decide: number | null;
    active_vacancies: number;
  };
  /** Candidatos presentados que esperan la decisión de la empresa (más antiguos primero) */
  pending: PipelineRow[];
  /** Últimas decisiones de la empresa, con su motivo */
  recent_decisions: PipelineRow[];
  vacancies: VacancyHealth[];
  team: TeamMember[];
}

const DAY = 24 * 60 * 60 * 1000;
const RECENT_DECISIONS = 8;

export function computeCompanyInsights(data: InsightsData): CompanyInsights {
  const { now } = data;
  const base = computeInsights(data, { period: 'all' });
  const rows = base.pipeline.rows;

  // Un candidato presentado puede tener una fila por vacante: para decisiones cuenta una vez
  const once = (list: PipelineRow[]) => {
    const seen = new Set<string>();
    return list.filter((r) => !seen.has(`${r.kind}:${r.id}`) && seen.add(`${r.kind}:${r.id}`));
  };
  const pending = once(rows.filter((r) => r.stage === 'aprobado')).sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  const decided = once(rows.filter((r) => r.stage === 'contratado' || r.stage === 'descartado_empresa'))
    .sort((a, b) => String(b.event.at ?? '').localeCompare(String(a.event.at ?? '')));

  const decideTimes = data.bridges
    .filter((b) => b.presented_at && b.company_decided_at && b.company_decision && b.company_decision !== 'pendiente')
    .map((b) => (new Date(b.company_decided_at!).getTime() - new Date(b.presented_at!).getTime()) / DAY)
    .filter((d) => d >= 0);

  const since30 = now.getTime() - 30 * DAY;
  const team: TeamMember[] = data.team.map((m) => {
    const presented = data.bridges.filter((b) => b.presented_by === m.id && b.presented_to_company);
    const hired = presented.filter((b) => b.company_decision === 'contratado').length;
    return {
      id: m.id,
      full_name: m.full_name,
      last_login: m.last_login,
      suspended: m.suspended === true,
      contacted_30d: data.contacts.filter((c) => c.recruiter_id === m.id && new Date(c.created_at).getTime() >= since30).length,
      presented: presented.length,
      hired,
      hire_rate: presented.length ? Math.round((hired / presented.length) * 100) : null,
    };
  }).sort((a, b) => b.presented - a.presented || b.contacted_30d - a.contacted_30d);

  return {
    kpis: {
      pending: pending.length,
      oldest_pending_days: pending.length ? pending[0].days : null,
      hired: decided.filter((r) => r.stage === 'contratado').length,
      discarded: decided.filter((r) => r.stage === 'descartado_empresa').length,
      avg_days_to_decide: decideTimes.length ? Math.round((decideTimes.reduce((a, b) => a + b, 0) / decideTimes.length) * 10) / 10 : null,
      active_vacancies: base.vacancies.length,
    },
    pending,
    recent_decisions: decided.slice(0, RECENT_DECISIONS),
    vacancies: base.vacancies,
    team,
  };
}
