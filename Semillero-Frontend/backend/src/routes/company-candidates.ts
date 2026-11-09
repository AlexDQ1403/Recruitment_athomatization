import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { getCorrelationId } from '../utils/tracing';
import { z } from 'zod';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type CompanyDecision = 'pendiente' | 'contratado' | 'descartado';

interface CompanyCandidateRow {
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

    // Conteos exactos de toda la bandeja (no de la página que se pide)
    const summary: Record<CompanyDecision, number> = { pendiente: 0, contratado: 0, descartado: 0 };
    for (const d of Object.keys(summary) as CompanyDecision[]) {
      const { count: n, error: countError } = await supabaseAdmin
        .from('company_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('presented_to_company', true)
        .eq('company_decision', d);
      if (countError) {
        logger.error('Error contando decisiones de la empresa', { error: JSON.stringify(countError) });
        if (['PGRST204', '42703', '42P01'].includes(String((countError as { code?: unknown }).code))) {
          res.status(503).json({ error: 'Los candidatos presentados no están disponibles por una actualización pendiente de la base de datos. Avisa al administrador.' });
          return;
        }
        res.status(500).json({ error: 'Error interno' });
        return;
      }
      summary[d] = n ?? 0;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: bridgeRows, error: bridgeError, count } = await supabaseAdmin
      .from('company_candidates')
      .select(
        'id, candidate_profile_id, legacy_candidate_id, status, presented_at, presented_by, company_decision, company_decided_at',
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
      res.json({ candidates: [], total: count ?? 0, limit, offset, summary });
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
          kind: 'profile',
          decision: ((r as { company_decision?: CompanyDecision }).company_decision ?? 'pendiente'),
          decided_at: (r as { company_decided_at?: string | null }).company_decided_at ?? null,
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
        kind: 'legacy',
        decision: ((r as { company_decision?: CompanyDecision }).company_decision ?? 'pendiente'),
        decided_at: (r as { company_decided_at?: string | null }).company_decided_at ?? null,
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

    res.json({ candidates: result, total: count ?? 0, limit, offset, summary });
  } catch (err) {
    logger.error('Error listando candidatos presentados a la empresa', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

const decisionSchema = z.object({ decision: z.enum(['contratar', 'descartar']) });
const idSchema = z.string().uuid();

/**
 * PATCH /api/company/candidates/:kind/:id/decision — { decision: 'contratar' | 'descartar' }
 *
 * La empresa decide por su cuenta sobre un candidato que un reclutador le presentó. Es
 * independiente del pipeline del reclutador y definitiva. Un candidato no presentado (o de
 * otra empresa) da 404: la empresa no puede ni confirmar que existe.
 */
router.patch('/:kind/:id/decision', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.locals?.companyId;
    const userId = req.locals?.user?.id;
    if (!companyId || !userId) {
      res.status(403).json({ error: 'Usuario sin empresa asignada' });
      return;
    }
    const { kind, id } = req.params;
    if (kind !== 'profile' && kind !== 'legacy') {
      res.status(400).json({ error: 'Tipo de candidato inválido' });
      return;
    }
    if (!idSchema.safeParse(id).success) {
      res.status(400).json({ error: 'Id de candidato inválido' });
      return;
    }
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'decision debe ser: contratar o descartar' });
      return;
    }
    const target: CompanyDecision = parsed.data.decision === 'contratar' ? 'contratado' : 'descartado';
    const originColumn = kind === 'profile' ? 'candidate_profile_id' : 'legacy_candidate_id';

    const { data: bridge, error: lookupError } = await supabaseAdmin
      .from('company_candidates')
      .select('id, company_decision')
      .eq('company_id', companyId)
      .eq(originColumn, id)
      .eq('presented_to_company', true)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!bridge) {
      res.status(404).json({ error: 'Candidato no encontrado' });
      return;
    }

    const current = (bridge.company_decision ?? 'pendiente') as CompanyDecision;
    if (current === target) {
      res.json({ kind, id, decision: current, unchanged: true });
      return;
    }
    if (current !== 'pendiente') {
      res.status(409).json({ error: `Ya decidiste sobre este candidato: ${current}` });
      return;
    }

    // Condicional: si otra petición decidió entre la consulta y la escritura, no se pisa
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('company_candidates')
      .update({ company_decision: target, company_decided_at: new Date().toISOString(), company_decided_by: userId })
      .eq('id', bridge.id)
      .eq('company_id', companyId)
      .eq('company_decision', 'pendiente')
      .select('id');
    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      res.status(409).json({ error: 'Este candidato ya tiene una decisión' });
      return;
    }

    logger.info('Decisión de la empresa sobre candidato', {
      correlationId: getCorrelationId(req), companyId, userId, kind, candidateId: id, decision: target,
    });
    res.json({ kind, id, decision: target });
  } catch (err) {
    const e = err as { code?: unknown; message?: unknown } | null;
    logger.error('Error registrando la decisión de la empresa', {
      correlationId: getCorrelationId(req),
      error: err instanceof Error ? err.message : JSON.stringify({ code: e?.code, message: e?.message }),
    });
    if (['PGRST204', '42703', '42P01', '23514'].includes(String(e?.code))) {
      res.status(503).json({ error: 'La decisión de la empresa no está disponible por una actualización pendiente de la base de datos. Avisa al administrador.' });
      return;
    }
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
