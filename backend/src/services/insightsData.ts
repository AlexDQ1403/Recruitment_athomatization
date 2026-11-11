import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightsInput } from './recruiterInsights';

/** Lee de una vez todo lo que necesitan los dashboards (reclutador y empresa) para una empresa */

const ROW_CAP = 1000; // tope de filas por consulta en Supabase

export interface InsightsData extends InsightsInput {
  /** Todos los reclutadores de la empresa (aunque aún no hayan hecho nada). */
  team: { id: string; full_name: string; email: string | null; last_login: string | null; suspended: boolean | null }[];
}

function rows<T>(res: { data: unknown; error: unknown }): T[] {
  if (res.error) throw res.error;
  return (res.data ?? []) as T[];
}

const BRIDGE_COLUMNS = 'legacy_candidate_id, candidate_profile_id, status, source, presented_to_company, presented_at, presented_by, company_decision, company_decided_at, created_at';

export async function loadInsightsData(
  db: SupabaseClient,
  companyId: string,
  warn: (what: string, error: unknown) => void
): Promise<InsightsData> {
  const optional = async <T>(what: string, query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
    const res = await query;
    if (res.error) {
      warn(what, res.error);
      return [];
    }
    return (res.data ?? []) as T[];
  };

  // Motivo de la decisión de la empresa (migración 028): si aún no existe, se lee sin él
  const bridgesQuery = async () => {
    const withReason = await db.from('company_candidates').select(`${BRIDGE_COLUMNS}, company_decision_reason`)
      .eq('company_id', companyId).range(0, ROW_CAP - 1);
    if (!withReason.error) return withReason;
    warn('motivo de la decisión de la empresa', withReason.error);
    return db.from('company_candidates').select(BRIDGE_COLUMNS).eq('company_id', companyId).range(0, ROW_CAP - 1);
  };

  const [legacyRes, bridgeRes, appsRes, vacanciesRes, teamRes, contacts, rejections] = await Promise.all([
    db.from('candidates')
      .select('id, full_name, position, source, status, vacancy_id, created_at')
      .eq('company_id', companyId).range(0, ROW_CAP - 1),
    bridgesQuery(),
    db.from('applications')
      .select('candidate_profile_id, vacancy_id, status, created_at')
      .eq('company_id', companyId).range(0, ROW_CAP - 1),
    db.from('vacancies')
      .select('id, title, status, created_at, deadline')
      .eq('company_id', companyId).range(0, ROW_CAP - 1),
    db.from('profiles')
      .select('id, full_name, email, last_login, suspended')
      .eq('company_id', companyId).eq('role', 'recruiter').range(0, ROW_CAP - 1),
    optional<InsightsInput['contacts'][number]>('contactos',
      db.from('candidate_contact_log').select('legacy_candidate_id, candidate_profile_id, created_at, channel, recruiter_id').eq('company_id', companyId).range(0, ROW_CAP - 1)),
    optional<InsightsInput['rejections'][number]>('rechazos por puesto',
      db.from('candidate_rejections').select('legacy_candidate_id, candidate_profile_id, role_label, role_key, vacancy_id, reason, rejected_by, created_at').eq('company_id', companyId).range(0, ROW_CAP - 1)),
  ]);

  const bridges = rows<InsightsInput['bridges'][number]>(bridgeRes);
  const applications = rows<InsightsInput['applications'][number]>(appsRes);
  const team = rows<InsightsData['team'][number]>(teamRes);

  // Nombre y título de los candidatos con cuenta
  const profileIds = [...new Set([
    ...applications.map((a) => a.candidate_profile_id),
    ...bridges.map((b) => b.candidate_profile_id).filter((id): id is string => !!id),
  ])];
  let profiles: InsightsInput['profiles'] = [];
  if (profileIds.length) {
    const cps = rows<{ id: string; profile_id: string; professional_title: string | null; position: string | null }>(
      await db.from('candidate_profiles').select('id, profile_id, professional_title, position').in('id', profileIds)
    );
    const names = new Map(
      rows<{ id: string; full_name: string }>(
        cps.length ? await db.from('profiles').select('id, full_name').in('id', cps.map((c) => c.profile_id)) : { data: [], error: null }
      ).map((p) => [p.id, p.full_name])
    );
    profiles = cps.map((c) => ({
      id: c.id,
      full_name: names.get(c.profile_id) ?? 'Candidato',
      title: c.professional_title?.trim() || c.position || null,
    }));
  }

  return {
    now: new Date(),
    legacy: rows<InsightsInput['legacy'][number]>(legacyRes),
    bridges,
    applications,
    profiles,
    contacts,
    rejections,
    vacancies: rows<InsightsInput['vacancies'][number]>(vacanciesRes),
    // Quién aprobó, contactó o rechazó: nombres del equipo (también la cuenta de empresa no aparece aquí)
    recruiters: team.map((t) => ({ id: t.id, full_name: t.full_name })),
    team,
  };
}
