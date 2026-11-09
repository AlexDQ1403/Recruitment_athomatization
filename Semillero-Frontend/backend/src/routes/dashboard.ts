import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

// Ver specs/dashboard_reclutador_design.md
const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PIPELINE = ['seguimiento', 'en_contacto', 'rechazado'] as const;
type Pipeline = (typeof PIPELINE)[number];
const RECENT = 8;
const TOP_VACANCIES = 5;
const ROW_CAP = 1000; // tope de filas por consulta en Supabase

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  const e = err as { code?: unknown; message?: unknown } | null;
  return JSON.stringify({ code: e?.code, message: e?.message });
}

/** Cuenta filas sin traerlas. Lanza el error de Supabase si lo hay. */
async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

function rows<T>(res: { data: unknown; error: unknown }): T[] {
  if (res.error) throw res.error;
  return (res.data ?? []) as T[];
}

router.get('/recruiter', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const companyId = req.locals?.companyId;
  if (!companyId) {
    res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
    return;
  }

  try {
    const head = { count: 'exact' as const, head: true };

    // ── Pipeline: fichas heredadas + candidatos con cuenta ───────────────────────
    const pipeline: Record<Pipeline, number> = { seguimiento: 0, en_contacto: 0, rechazado: 0 };
    await Promise.all(PIPELINE.map(async (status) => {
      const [legacy, accounts] = await Promise.all([
        count(supabaseAdmin.from('candidates').select('id', head).eq('company_id', companyId).eq('status', status)),
        count(supabaseAdmin.from('company_candidates').select('id', head).eq('company_id', companyId).eq('status', status).not('candidate_profile_id', 'is', null)),
      ]);
      pipeline[status] = legacy + accounts;
    }));

    // Postulantes sin fila en company_candidates (altas previas a la corrección del portal): seguimiento
    const appsRes = await supabaseAdmin
      .from('applications')
      .select('candidate_profile_id')
      .eq('company_id', companyId)
      .range(0, ROW_CAP - 1);
    const applicantIds = [...new Set(rows<{ candidate_profile_id: string }>(appsRes).map((a) => a.candidate_profile_id))];
    if (applicantIds.length) {
      const bridged = new Set(
        rows<{ candidate_profile_id: string }>(
          await supabaseAdmin.from('company_candidates').select('candidate_profile_id').eq('company_id', companyId).in('candidate_profile_id', applicantIds)
        ).map((b) => b.candidate_profile_id)
      );
      pipeline.seguimiento += applicantIds.filter((id) => !bridged.has(id)).length;
    }
    const total = pipeline.seguimiento + pipeline.en_contacto + pipeline.rechazado;

    // ── Aprobados: los que ve la empresa ─────────────────────────────────────────
    const approved = await count(
      supabaseAdmin.from('company_candidates').select('id', head).eq('company_id', companyId).eq('presented_to_company', true).neq('status', 'rechazado')
    );

    // Contratados: lo que decidió la empresa. Si la migración 024 aún no se aplicó, no tumba
    // el dashboard: se muestra 0 y queda el aviso en el log.
    let hired = 0;
    try {
      hired = await count(
        supabaseAdmin.from('company_candidates').select('id', head).eq('company_id', companyId).eq('presented_to_company', true).eq('company_decision', 'contratado')
      );
    } catch (hiredError) {
      logger.warn('No se pudo contar los contratados (¿migración 024 pendiente?)', { correlationId: getCorrelationId(req), error: describeError(hiredError) });
    }

    // ── Vacantes ─────────────────────────────────────────────────────────────────
    const vacancyRows = rows<{ id: string; title: string; status: string }>(
      await supabaseAdmin.from('vacancies').select('id, title, status').eq('company_id', companyId).range(0, ROW_CAP - 1)
    );
    const vacancyTitle = new Map(vacancyRows.map((v) => [v.id, v.title]));
    const activeIds = vacancyRows.filter((v) => v.status === 'active').map((v) => v.id);

    const applicantsByVacancy = new Map<string, number>();
    if (activeIds.length) {
      const [appRows, legacyRows] = await Promise.all([
        supabaseAdmin.from('applications').select('vacancy_id').eq('company_id', companyId).in('vacancy_id', activeIds).range(0, ROW_CAP - 1),
        supabaseAdmin.from('candidates').select('vacancy_id').eq('company_id', companyId).in('vacancy_id', activeIds).range(0, ROW_CAP - 1),
      ]);
      for (const r of [...rows<{ vacancy_id: string }>(appRows), ...rows<{ vacancy_id: string }>(legacyRows)]) {
        applicantsByVacancy.set(r.vacancy_id, (applicantsByVacancy.get(r.vacancy_id) ?? 0) + 1);
      }
    }
    const top = activeIds
      .map((id) => ({ id, title: vacancyTitle.get(id) ?? '', applicants: applicantsByVacancy.get(id) ?? 0 }))
      .sort((a, b) => b.applicants - a.applicants || a.title.localeCompare(b.title))
      .slice(0, TOP_VACANCIES);

    // ── Actividad reciente: fichas heredadas + postulaciones ─────────────────────
    const [recentLegacy, recentApps] = await Promise.all([
      supabaseAdmin.from('candidates')
        .select('id, full_name, position, location, status, vacancy_id, created_at')
        .eq('company_id', companyId).order('created_at', { ascending: false }).range(0, RECENT - 1),
      supabaseAdmin.from('applications')
        .select('candidate_profile_id, vacancy_id, created_at')
        .eq('company_id', companyId).order('created_at', { ascending: false }).range(0, RECENT - 1),
    ]);
    const legacy = rows<{ id: string; full_name: string; position: string | null; location: string | null; status: Pipeline; vacancy_id: string | null; created_at: string }>(recentLegacy);
    const apps = rows<{ candidate_profile_id: string; vacancy_id: string; created_at: string }>(recentApps);

    const recent: {
      kind: 'profile' | 'legacy'; id: string; full_name: string; title: string | null; location: string | null;
      status: Pipeline; vacancy_title: string | null; created_at: string;
    }[] = legacy.map((c) => ({
      kind: 'legacy', id: c.id, full_name: c.full_name, title: c.position ?? null, location: c.location ?? null,
      status: c.status, vacancy_title: c.vacancy_id ? vacancyTitle.get(c.vacancy_id) ?? null : null, created_at: c.created_at,
    }));

    if (apps.length) {
      const ids = [...new Set(apps.map((a) => a.candidate_profile_id))];
      const [cpRes, bridgeRes] = await Promise.all([
        supabaseAdmin.from('candidate_profiles').select('id, profile_id, professional_title, position, location').in('id', ids),
        supabaseAdmin.from('company_candidates').select('candidate_profile_id, status').eq('company_id', companyId).in('candidate_profile_id', ids),
      ]);
      const cps = rows<{ id: string; profile_id: string; professional_title: string | null; position: string | null; location: string | null }>(cpRes);
      const names = new Map(
        rows<{ id: string; full_name: string }>(
          cps.length ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', cps.map((c) => c.profile_id)) : { data: [], error: null }
        ).map((p) => [p.id, p.full_name])
      );
      const cpById = new Map(cps.map((c) => [c.id, c]));
      const statusById = new Map(rows<{ candidate_profile_id: string; status: Pipeline }>(bridgeRes).map((b) => [b.candidate_profile_id, b.status]));
      for (const a of apps) {
        const cp = cpById.get(a.candidate_profile_id);
        if (!cp) continue;
        recent.push({
          kind: 'profile', id: cp.id, full_name: names.get(cp.profile_id) ?? 'Candidato',
          title: cp.professional_title?.trim() || cp.position || null, location: cp.location ?? null,
          status: statusById.get(cp.id) ?? 'seguimiento', vacancy_title: vacancyTitle.get(a.vacancy_id) ?? null, created_at: a.created_at,
        });
      }
    }
    recent.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    res.json({
      pipeline,
      total,
      approved,
      hired,
      vacancies: {
        active: vacancyRows.filter((v) => v.status === 'active').length,
        paused: vacancyRows.filter((v) => v.status === 'paused').length,
        closed: vacancyRows.filter((v) => v.status === 'closed').length,
        applicants_active: [...applicantsByVacancy.values()].reduce((a, b) => a + b, 0),
        top,
      },
      recent: recent.slice(0, RECENT),
    });
  } catch (err) {
    logger.error('Error armando el dashboard del reclutador', { correlationId: getCorrelationId(req), error: describeError(err) });
    const code = String((err as { code?: unknown } | null)?.code);
    if (['PGRST204', '42703', '42P01'].includes(code)) {
      res.status(503).json({ error: 'El dashboard no está disponible por una actualización pendiente de la base de datos. Avisa al administrador.' });
      return;
    }
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
