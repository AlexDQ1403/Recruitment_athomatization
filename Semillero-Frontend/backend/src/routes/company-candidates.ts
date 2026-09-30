import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface CompanyCandidateRow {
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
  status_history: { from_status: string | null; to_status: string; changed_at: string; changed_by_name: string | null }[];
}

/**
 * GET /api/company/candidates
 *
 * Bandeja de Empresa: histórico de procesos, no un listado de candidatos.
 * Solo devuelve relaciones company_candidates con presented_to_company=true
 * (ver migración 018) — un reclutador tuvo que revisar y aprobar al
 * candidato explícitamente antes de que la empresa pueda verlo aquí.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.locals?.companyId;
    if (!companyId) {
      res.status(403).json({ error: 'Usuario sin empresa asignada' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: bridgeRows, error: bridgeError, count } = await supabaseAdmin
      .from('company_candidates')
      .select(
        'id, candidate_profile_id, legacy_candidate_id, status, presented_at, presented_by',
        { count: 'exact' }
      )
      .eq('company_id', companyId)
      .eq('presented_to_company', true)
      .order('presented_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (bridgeError) {
      res.status(500).json({ error: bridgeError.message });
      return;
    }

    const rows = bridgeRows ?? [];
    if (rows.length === 0) {
      res.json({ candidates: [], total: count ?? 0, limit, offset });
      return;
    }

    const profileIds = rows.map((r) => r.candidate_profile_id).filter((id): id is string => !!id);
    const legacyIds = rows.map((r) => r.legacy_candidate_id).filter((id): id is string => !!id);
    const recruiterIds = [...new Set(rows.map((r) => r.presented_by).filter((id): id is string => !!id))];

    const [profilesRes, legacyRes, recruitersRes, applicationsRes] = await Promise.all([
      profileIds.length
        ? supabaseAdmin
            .from('candidate_profiles')
            .select('id, position, location, experience_years, profile_id, profiles:profile_id(full_name)')
            .in('id', profileIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      legacyIds.length
        ? supabaseAdmin
            .from('candidates')
            .select('id, full_name, position, location, experience_years, vacancy_id')
            .in('id', legacyIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      recruiterIds.length
        ? supabaseAdmin.from('profiles').select('id, full_name').in('id', recruiterIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      profileIds.length
        ? supabaseAdmin
            .from('applications')
            .select('candidate_profile_id, vacancy_id, vacancies:vacancy_id(id, title)')
            .eq('company_id', companyId)
            .in('candidate_profile_id', profileIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const legacyVacancyIds = [
      ...new Set((legacyRes.data as { vacancy_id: string | null }[] ?? []).map((c) => c.vacancy_id).filter((id): id is string => !!id)),
    ];
    const legacyVacanciesRes = legacyVacancyIds.length
      ? await supabaseAdmin.from('vacancies').select('id, title').in('id', legacyVacancyIds)
      : { data: [] as { id: string; title: string }[] };

    const historyRes = legacyIds.length
      ? await supabaseAdmin
          .from('candidate_status_history')
          .select('candidate_id, from_status, to_status, changed_at, changer:changed_by(full_name)')
          .in('candidate_id', legacyIds)
          .order('changed_at', { ascending: true })
      : { data: [] as Record<string, unknown>[] };

    const profileById = new Map((profilesRes.data as Record<string, unknown>[] ?? []).map((p) => [p.id as string, p]));
    const legacyById = new Map((legacyRes.data as Record<string, unknown>[] ?? []).map((c) => [c.id as string, c]));
    const recruiterById = new Map((recruitersRes.data as { id: string; full_name: string }[] ?? []).map((r) => [r.id, r]));
    const legacyVacancyById = new Map((legacyVacanciesRes.data as { id: string; title: string }[] ?? []).map((v) => [v.id, v]));
    const applicationByProfileId = new Map(
      (applicationsRes.data as Record<string, unknown>[] ?? []).map((a) => [a.candidate_profile_id as string, a])
    );
    const historyByLegacyId = new Map<string, Record<string, unknown>[]>();
    for (const h of (historyRes.data as Record<string, unknown>[] ?? [])) {
      const key = h.candidate_id as string;
      if (!historyByLegacyId.has(key)) historyByLegacyId.set(key, []);
      historyByLegacyId.get(key)!.push(h);
    }

    const result: CompanyCandidateRow[] = rows.map((r) => {
      const recruiter = r.presented_by ? recruiterById.get(r.presented_by) ?? null : null;

      if (r.candidate_profile_id) {
        const profile = profileById.get(r.candidate_profile_id) as Record<string, unknown> | undefined;
        const application = applicationByProfileId.get(r.candidate_profile_id) as Record<string, unknown> | undefined;
        const vacancyInfo = application?.vacancies as { id: string; title: string } | undefined;
        return {
          candidate: {
            id: r.candidate_profile_id,
            full_name: (profile?.profiles as { full_name?: string } | undefined)?.full_name ?? 'Candidato',
            position: (profile?.position as string) ?? null,
            location: (profile?.location as string) ?? null,
            experience_years: (profile?.experience_years as number) ?? null,
          },
          recruiter: recruiter ? { id: r.presented_by as string, full_name: recruiter.full_name } : null,
          vacancy: vacancyInfo ? { id: vacancyInfo.id, title: vacancyInfo.title } : null,
          presented_at: r.presented_at,
          status: r.status,
          // El historial de cambios de estado de candidatos con perfil propio
          // (candidate_profile_id) todavía no se registra: company_candidates.status
          // no tiene tabla de auditoría propia. Se añade cuando exista esa acción.
          status_history: [],
        };
      }

      const legacy = legacyById.get(r.legacy_candidate_id as string) as Record<string, unknown> | undefined;
      const legacyVacancy = legacy?.vacancy_id ? legacyVacancyById.get(legacy.vacancy_id as string) : undefined;
      const history = historyByLegacyId.get(r.legacy_candidate_id as string) ?? [];

      return {
        candidate: {
          id: r.legacy_candidate_id as string,
          full_name: (legacy?.full_name as string) ?? 'Candidato',
          position: (legacy?.position as string) ?? null,
          location: (legacy?.location as string) ?? null,
          experience_years: (legacy?.experience_years as number) ?? null,
        },
        recruiter: recruiter ? { id: r.presented_by as string, full_name: recruiter.full_name } : null,
        vacancy: legacyVacancy ? { id: legacyVacancy.id, title: legacyVacancy.title } : null,
        presented_at: r.presented_at,
        status: (legacy?.status as string) ?? r.status,
        status_history: history.map((h) => ({
          from_status: (h.from_status as string) ?? null,
          to_status: h.to_status as string,
          changed_at: h.changed_at as string,
          changed_by_name: (h.changer as { full_name?: string } | undefined)?.full_name ?? null,
        })),
      };
    });

    res.json({ candidates: result, total: count ?? 0, limit, offset });
  } catch (err) {
    logger.error('Error listando candidatos presentados a la empresa', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
