import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

// Se monta en /api/vacancies/:vacancyId/applicants
// (ver specs/candidatos_por_vacante_design.md y specs/decision_empresa_design.md)
const router = Router({ mergeParams: true });
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PIPELINE = ['seguimiento', 'en_contacto', 'rechazado'] as const;
type PipelineStatus = (typeof PIPELINE)[number];
type CompanyDecision = 'pendiente' | 'contratado' | 'descartado';
type Kind = 'profile' | 'legacy';

// 'rechazado' es terminal, igual que en candidates.ts
const TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  seguimiento: ['en_contacto', 'rechazado'],
  en_contacto: ['seguimiento', 'rechazado'],
  rechazado: [],
};

// Estado visible para el candidato en su postulación (migración 016)
const APPLICATION_STATUS: Record<PipelineStatus, string> = {
  seguimiento: 'en_revision',
  en_contacto: 'contactado',
  rechazado: 'descartada',
};

const MAX_APPLICANTS = 200;

const idSchema = z.string().uuid();
const bodySchema = z.object({
  status: z.enum(PIPELINE),
  reason: z.string().trim().max(500).optional(),
});

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  const e = err as { code?: unknown; message?: unknown } | null;
  return JSON.stringify({ code: e?.code, message: e?.message });
}

function isSchemaDrift(err: unknown): boolean {
  return ['PGRST204', '42703', '42P01', '23514'].includes(String((err as { code?: unknown } | null)?.code));
}

function fail(req: AuthenticatedRequest, res: Response, label: string, err: unknown): void {
  logger.error(label, { correlationId: getCorrelationId(req), error: describeError(err) });
  if (isSchemaDrift(err)) {
    res.status(503).json({ error: 'Los candidatos no están disponibles por una actualización pendiente de la base de datos. Avisa al administrador.' });
    return;
  }
  res.status(500).json({ error: 'Error interno' });
}

interface Ctx { companyId: string; userId: string; vacancyId: string; role: string }

/** La empresa sale del token; la vacante debe ser suya. Responde y devuelve null si no. */
async function ownVacancy(req: AuthenticatedRequest, res: Response): Promise<Ctx | null> {
  const companyId = req.locals?.companyId;
  const userId = req.locals?.user?.id;
  if (!companyId || !userId) {
    res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
    return null;
  }
  const vacancyId = req.params.vacancyId;
  if (!idSchema.safeParse(vacancyId).success) {
    res.status(400).json({ error: 'Id de vacante inválido' });
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from('vacancies')
    .select('id')
    .eq('id', vacancyId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    res.status(404).json({ error: 'Vacante no encontrada' });
    return null;
  }
  return { companyId, userId, vacancyId, role: req.locals?.profile?.role ?? '' };
}

/** Solo el reclutador aprueba y cambia el pipeline. Responde 403 y devuelve false si no lo es. */
function requireRecruiter(ctx: Ctx, res: Response): boolean {
  if (ctx.role !== 'recruiter') {
    res.status(403).json({ error: 'Solo un reclutador puede gestionar el proceso de los candidatos' });
    return false;
  }
  return true;
}

const originColumn = (kind: Kind) => (kind === 'profile' ? 'candidate_profile_id' : 'legacy_candidate_id');

interface Bridge { id: string; status: PipelineStatus; presented_to_company: boolean; company_decision: CompanyDecision }

async function findBridge(companyId: string, kind: Kind, id: string): Promise<Bridge | null> {
  const { data, error } = await supabaseAdmin
    .from('company_candidates')
    .select('id, status, presented_to_company, company_decision')
    .eq('company_id', companyId)
    .eq(originColumn(kind), id)
    .maybeSingle();
  if (error) throw error;
  return (data as Bridge | null) ?? null;
}

const DECIDED_MESSAGE = 'La empresa ya decidió sobre este candidato: no se puede cambiar su proceso';
const decided = (b: Bridge | null) => !!b && !!b.company_decision && b.company_decision !== 'pendiente';

interface ApplicantItem {
  kind: Kind;
  id: string;
  full_name: string;
  title: string | null;
  location: string | null;
  experience_years: number | null;
  status: PipelineStatus;
  /** Aprobado por un reclutador: es lo único que la empresa puede ver. */
  presented: boolean;
  company_decision: CompanyDecision;
  applied_at: string | null;
}

/**
 * GET /api/vacancies/:vacancyId/applicants — postulantes de la vacante con datos básicos
 * (sin email, teléfono, salario ni CV). El rol empresa solo recibe los que un reclutador aprobó.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const ctx = await ownVacancy(req, res);
    if (!ctx) return;
    const { companyId, vacancyId, role } = ctx;

    const [appsRes, legacyRes] = await Promise.all([
      supabaseAdmin
        .from('applications')
        .select('candidate_profile_id, created_at')
        .eq('vacancy_id', vacancyId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(0, MAX_APPLICANTS - 1),
      supabaseAdmin
        .from('candidates')
        .select('id, full_name, position, location, experience_years, status, created_at')
        .eq('vacancy_id', vacancyId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(0, MAX_APPLICANTS - 1),
    ]);
    if (appsRes.error) throw appsRes.error;
    if (legacyRes.error) throw legacyRes.error;

    const apps = (appsRes.data ?? []) as { candidate_profile_id: string; created_at: string }[];
    const legacy = (legacyRes.data ?? []) as { id: string; full_name: string; position: string | null; location: string | null; experience_years: number | null; status: PipelineStatus; created_at: string }[];
    const profileIds = apps.map((a) => a.candidate_profile_id);
    const legacyIds = legacy.map((c) => c.id);

    const [profilesRes, profileBridgeRes, legacyBridgeRes] = await Promise.all([
      profileIds.length
        ? supabaseAdmin.from('candidate_profiles').select('id, profile_id, professional_title, position, location, experience_years').in('id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? supabaseAdmin.from('company_candidates').select('candidate_profile_id, status, presented_to_company, company_decision').eq('company_id', companyId).in('candidate_profile_id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      legacyIds.length
        ? supabaseAdmin.from('company_candidates').select('legacy_candidate_id, presented_to_company, company_decision').eq('company_id', companyId).in('legacy_candidate_id', legacyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (profileBridgeRes.error) throw profileBridgeRes.error;
    if (legacyBridgeRes.error) throw legacyBridgeRes.error;

    const cps = (profilesRes.data ?? []) as { id: string; profile_id: string; professional_title: string | null; position: string | null; location: string | null; experience_years: number | null }[];
    const accountIds = cps.map((c) => c.profile_id);
    const namesRes = accountIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', accountIds)
      : { data: [] as { id: string; full_name: string }[], error: null };
    if (namesRes.error) throw namesRes.error;

    const cpById = new Map(cps.map((c) => [c.id, c]));
    const nameById = new Map(((namesRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
    const profileBridge = new Map(
      ((profileBridgeRes.data ?? []) as { candidate_profile_id: string; status: PipelineStatus; presented_to_company: boolean; company_decision: CompanyDecision }[]).map((b) => [b.candidate_profile_id, b])
    );
    const legacyBridge = new Map(
      ((legacyBridgeRes.data ?? []) as { legacy_candidate_id: string; presented_to_company: boolean; company_decision: CompanyDecision }[]).map((b) => [b.legacy_candidate_id, b])
    );

    const items: ApplicantItem[] = [];

    for (const a of apps) {
      const cp = cpById.get(a.candidate_profile_id);
      if (!cp) continue;
      const bridge = profileBridge.get(cp.id);
      items.push({
        kind: 'profile',
        id: cp.id,
        full_name: nameById.get(cp.profile_id) ?? 'Candidato',
        // Encabezado profesional que escribe el candidato; `position` es el respaldo
        title: cp.professional_title?.trim() || cp.position || null,
        location: cp.location ?? null,
        experience_years: cp.experience_years ?? null,
        // Sin fila en company_candidates el candidato aún no se ha gestionado: seguimiento
        status: bridge?.status ?? 'seguimiento',
        presented: bridge?.presented_to_company === true,
        company_decision: bridge?.company_decision ?? 'pendiente',
        applied_at: a.created_at,
      });
    }

    for (const c of legacy) {
      const bridge = legacyBridge.get(c.id);
      items.push({
        kind: 'legacy',
        id: c.id,
        full_name: c.full_name,
        title: c.position ?? null,
        location: c.location ?? null,
        experience_years: c.experience_years ?? null,
        status: c.status,
        presented: bridge?.presented_to_company === true,
        company_decision: bridge?.company_decision ?? 'pendiente',
        applied_at: c.created_at,
      });
    }

    // La empresa NUNCA ve candidatos que un reclutador no aprobó
    const visible = role === 'empresa' ? items.filter((i) => i.presented) : items;
    visible.sort((a, b) => String(b.applied_at).localeCompare(String(a.applied_at)));
    res.json({ items: visible, total: visible.length });
  } catch (err) {
    fail(req, res, 'Error listando postulantes de la vacante', err);
  }
});

/** Comprueba el tipo y el id de la ruta; responde 400 y devuelve null si no son válidos. */
function parseTarget(req: AuthenticatedRequest, res: Response): { kind: Kind; id: string } | null {
  const kind = req.params.kind;
  if (kind !== 'profile' && kind !== 'legacy') {
    res.status(400).json({ error: 'Tipo de candidato inválido' });
    return null;
  }
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(400).json({ error: 'Id de candidato inválido' });
    return null;
  }
  return { kind, id: req.params.id };
}

/**
 * POST /api/vacancies/:vacancyId/applicants/:kind/:id/approve — el reclutador aprueba al
 * candidato: desde ese momento la empresa lo ve y puede contratarlo o descartarlo.
 */
router.post('/:kind/:id/approve', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const target = parseTarget(req, res);
    if (!target) return;
    const ctx = await ownVacancy(req, res);
    if (!ctx || !requireRecruiter(ctx, res)) return;
    const { companyId, userId, vacancyId } = ctx;
    const { kind, id } = target;

    let status: PipelineStatus = 'seguimiento';
    let source = 'applicant';

    if (kind === 'legacy') {
      const { data: candidate, error } = await supabaseAdmin
        .from('candidates')
        .select('id, status, source')
        .eq('id', id)
        .eq('company_id', companyId)
        .eq('vacancy_id', vacancyId)
        .maybeSingle();
      if (error) throw error;
      if (!candidate) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }
      status = candidate.status as PipelineStatus;
      source = (candidate.source as string) ?? 'internal';
    } else {
      const { data: application, error } = await supabaseAdmin
        .from('applications')
        .select('id')
        .eq('vacancy_id', vacancyId)
        .eq('company_id', companyId)
        .eq('candidate_profile_id', id)
        .maybeSingle();
      if (error) throw error;
      if (!application) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }
    }

    const bridge = await findBridge(companyId, kind, id);
    if (bridge) status = bridge.status;

    if (status === 'rechazado') {
      res.status(409).json({ error: 'Un candidato rechazado no se puede aprobar' });
      return;
    }
    if (bridge?.presented_to_company) {
      res.json({ kind, id, presented: true, unchanged: true });
      return;
    }

    const fields = { presented_to_company: true, presented_at: new Date().toISOString(), presented_by: userId };
    const updateBridge = async () => {
      const { error } = await supabaseAdmin
        .from('company_candidates')
        .update(fields)
        .eq('company_id', companyId)
        .eq(originColumn(kind), id);
      if (error) throw error;
    };

    if (bridge) {
      await updateBridge();
    } else {
      // Sin upsert: el índice único es parcial y PostgREST responde 42P10 (ver candidates.ts)
      const { error: insertError } = await supabaseAdmin
        .from('company_candidates')
        .insert({ company_id: companyId, [originColumn(kind)]: id, status, source, created_by: userId, ...fields });
      if (insertError) {
        if ((insertError as { code?: string }).code === '23505') await updateBridge();
        else throw insertError;
      }
    }

    logger.info('Candidato aprobado para la empresa', { correlationId: getCorrelationId(req), vacancyId, kind, candidateId: id, companyId, userId });
    res.json({ kind, id, presented: true });
  } catch (err) {
    fail(req, res, 'Error aprobando candidato para la empresa', err);
  }
});

/**
 * PATCH /api/vacancies/:vacancyId/applicants/:kind/:id/status — { status, reason? }  (reclutador)
 * Seguimiento y rechazo sacan al candidato de la lista de aceptados de la empresa
 * (igual que la decisión del chat); en contacto no la toca. Si la empresa ya decidió, 409.
 */
router.patch('/:kind/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const target = parseTarget(req, res);
    if (!target) return;
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: `status debe ser uno de: ${PIPELINE.join(', ')}` });
      return;
    }
    const { status: toStatus, reason } = parsed.data;

    const ctx = await ownVacancy(req, res);
    if (!ctx || !requireRecruiter(ctx, res)) return;
    const { companyId, userId, vacancyId } = ctx;
    const { kind, id } = target;
    const leavesAcceptedList = toStatus === 'seguimiento' || toStatus === 'rechazado';

    const checkTransition = (from: PipelineStatus): 'same' | 'blocked' | 'ok' => {
      if (from === toStatus) return 'same';
      if (from === 'rechazado') return 'blocked';
      return TRANSITIONS[from].includes(toStatus) ? 'ok' : 'blocked';
    };
    const rejectBlocked = (from: PipelineStatus) => {
      if (from === 'rechazado') res.status(409).json({ error: 'Un candidato rechazado no se puede reactivar' });
      else res.status(400).json({ error: `Transición no permitida: ${from} → ${toStatus}` });
    };

    if (kind === 'legacy') {
      const { data: current, error } = await supabaseAdmin
        .from('candidates')
        .select('id, status')
        .eq('id', id)
        .eq('company_id', companyId)
        .eq('vacancy_id', vacancyId)
        .maybeSingle();
      if (error) throw error;
      if (!current) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }
      if (decided(await findBridge(companyId, kind, id))) {
        res.status(409).json({ error: DECIDED_MESSAGE });
        return;
      }
      const from = current.status as PipelineStatus;
      const check = checkTransition(from);
      if (check === 'same') {
        res.json({ kind, id, status: from, unchanged: true });
        return;
      }
      if (check === 'blocked') return rejectBlocked(from);

      const { error: updateError } = await supabaseAdmin
        .from('candidates')
        .update({ status: toStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', companyId);
      if (updateError) throw updateError;

      const { error: historyError } = await supabaseAdmin
        .from('candidate_status_history')
        .insert({ candidate_id: id, from_status: from, to_status: toStatus, changed_by: userId, reason: reason ?? null });
      if (historyError) logger.error('Error registrando historial de estado', { candidateId: id, error: describeError(historyError) });

      const { error: bridgeError } = await supabaseAdmin
        .from('company_candidates')
        .update({ status: toStatus, ...(leavesAcceptedList ? { presented_to_company: false } : {}) })
        .eq('company_id', companyId)
        .eq('legacy_candidate_id', id);
      if (bridgeError) throw bridgeError;
    } else {
      const { data: application, error } = await supabaseAdmin
        .from('applications')
        .select('id')
        .eq('vacancy_id', vacancyId)
        .eq('company_id', companyId)
        .eq('candidate_profile_id', id)
        .maybeSingle();
      if (error) throw error;
      if (!application) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }

      const bridge = await findBridge(companyId, kind, id);
      if (decided(bridge)) {
        res.status(409).json({ error: DECIDED_MESSAGE });
        return;
      }

      const from = (bridge?.status ?? 'seguimiento') as PipelineStatus;
      const check = checkTransition(from);
      if (check === 'same') {
        res.json({ kind, id, status: from, unchanged: true });
        return;
      }
      if (check === 'blocked') return rejectBlocked(from);

      const fields = { status: toStatus, ...(leavesAcceptedList ? { presented_to_company: false } : {}) };
      const updateBridge = async () => {
        const { error: e } = await supabaseAdmin
          .from('company_candidates')
          .update(fields)
          .eq('company_id', companyId)
          .eq('candidate_profile_id', id);
        if (e) throw e;
      };

      if (bridge) {
        await updateBridge();
      } else {
        // Sin upsert: el índice único es parcial y PostgREST responde 42P10 (ver candidates.ts)
        const { error: insertError } = await supabaseAdmin
          .from('company_candidates')
          .insert({ company_id: companyId, candidate_profile_id: id, source: 'applicant', created_by: userId, ...fields });
        if (insertError) {
          if ((insertError as { code?: string }).code === '23505') await updateBridge();
          else throw insertError;
        }
      }

      // El candidato ve su propio estado: se mantiene alineado. No bloquea el cambio del reclutador.
      const { error: appError } = await supabaseAdmin
        .from('applications')
        .update({ status: APPLICATION_STATUS[toStatus] })
        .eq('id', application.id)
        .eq('company_id', companyId);
      if (appError) logger.error('No se pudo sincronizar el estado de la postulación', { applicationId: application.id, error: describeError(appError) });
    }

    logger.info('Estado de candidato de vacante actualizado', {
      correlationId: getCorrelationId(req), vacancyId, kind, candidateId: id, companyId, userId, toStatus,
    });
    res.json({ kind, id, status: toStatus });
  } catch (err) {
    fail(req, res, 'Error cambiando estado de candidato de la vacante', err);
  }
});

export default router;
