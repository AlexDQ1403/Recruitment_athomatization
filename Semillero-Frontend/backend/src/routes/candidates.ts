import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import * as n8nService from '../services/n8nService';
import { z } from 'zod';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const VALID_STATUSES = ['rechazado', 'en_contacto', 'seguimiento'] as const;
type CandidateStatus = (typeof VALID_STATUSES)[number];

// 'rechazado' es terminal: no se sale de ese estado
const ALLOWED_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  seguimiento: ['en_contacto', 'rechazado'],
  en_contacto: ['seguimiento', 'rechazado'],
  rechazado: [],
};

const uuidSchema = z.string().uuid();

// Decisiones del reclutador (ver specs/decisiones_candidato_design.md)
const decisionSchema = z.object({
  decision: z.enum(['aprobar', 'seguimiento', 'rechazar']),
  reason: z.string().trim().max(500).optional(),
});

const MAX_DECISION_LOOKUP = 100;

const COMPANY_DECIDED_MESSAGE = 'La empresa ya decidió sobre este candidato: no se puede cambiar su proceso';

/**
 * Los errores de Supabase son objetos planos ({ message, code, details, hint }), no
 * instancias de Error: `String(err)` daba "[object Object]" y ocultaba la causa real.
 * Solo se usa para el log del servidor; al cliente nunca se le devuelve.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    return JSON.stringify({ code: e.code, message: e.message, details: e.details, hint: e.hint });
  }
  return String(err);
}

/**
 * Marca la relación empresa↔candidato como presentada (la empresa la ve en su lista de
 * aceptados), creándola si no existe.
 *
 * NO usa upsert a propósito: el único índice de (company_id, legacy_candidate_id) es
 * PARCIAL (migración 015: WHERE legacy_candidate_id IS NOT NULL) y PostgREST genera
 * `ON CONFLICT (company_id, legacy_candidate_id)` sin ese predicado, así que Postgres
 * responde 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
 * specification") y el endpoint devolvía 500 al aprobar.
 */
async function markPresented(
  companyId: string,
  candidate: { id: string; source: string },
  status: CandidateStatus,
  userId: string
): Promise<void> {
  const fields = {
    status,
    source: candidate.source,
    presented_to_company: true,
    presented_at: new Date().toISOString(),
    presented_by: userId,
  };

  const updateExisting = async () => {
    const { error } = await supabaseAdmin
      .from('company_candidates')
      .update(fields)
      .eq('company_id', companyId)
      .eq('legacy_candidate_id', candidate.id);
    if (error) throw error;
  };

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('company_candidates')
    .select('id')
    .eq('company_id', companyId)
    .eq('legacy_candidate_id', candidate.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return updateExisting();

  const { error: insertError } = await supabaseAdmin
    .from('company_candidates')
    .insert({ company_id: companyId, legacy_candidate_id: candidate.id, ...fields });
  if (!insertError) return;
  // Carrera: otra petición creó la relación entre la consulta y el insert
  if (insertError.code === '23505') return updateExisting();
  throw insertError;
}

const CANDIDATE_FIELDS =
  'id, full_name, position, email, phone, experience_years, expected_salary, location, source, status, resume_url, profile_url, linkedin_url, created_at, updated_at';

// GET /api/candidates - Listar candidatos de la empresa (con filtros)
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.locals?.companyId;
      if (!companyId) {
        res.status(403).json({ error: 'Usuario sin empresa asignada' });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;
      const source = req.query.source as string | undefined;
      const search = req.query.search as string | undefined;

      let query = supabaseAdmin
        .from('candidates')
        .select(CANDIDATE_FIELDS, { count: 'exact' })
        .eq('company_id', companyId);

      if (status && VALID_STATUSES.includes(status as CandidateStatus)) {
        query = query.eq('status', status);
      }
      if (source) {
        query = query.eq('source', source);
      }
      if (search) {
        const term = search.replace(/[%,()]/g, '');
        query = query.or(`full_name.ilike.%${term}%,position.ilike.%${term}%,location.ilike.%${term}%`);
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1)
        .order('updated_at', { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ candidates: data ?? [], total: count ?? 0, limit, offset });
    } catch (err) {
      logger.error('Error listando candidatos', { error: describeError(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/candidates/decisions?ids=a,b,c - Estado actual y si está aprobado,
// para que el chat muestre el estado vigente y no el de la captura del mensaje.
// Debe declararse ANTES de '/:id'. Solo candidatos de la empresa del usuario;
// devuelve únicamente estado y bandera (nunca datos personales).
router.get(
  '/decisions',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.locals?.companyId;
      if (!companyId) {
        res.status(403).json({ error: 'Usuario sin empresa asignada' });
        return;
      }

      const ids = [...new Set(String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
      if (ids.length === 0) {
        res.json({});
        return;
      }
      if (ids.length > MAX_DECISION_LOOKUP || ids.some((id) => !uuidSchema.safeParse(id).success)) {
        res.status(400).json({ error: `ids debe ser una lista de hasta ${MAX_DECISION_LOOKUP} uuid` });
        return;
      }

      const [candidatesRes, bridgeRes] = await Promise.all([
        supabaseAdmin.from('candidates').select('id, status').eq('company_id', companyId).in('id', ids),
        supabaseAdmin
          .from('company_candidates')
          .select('legacy_candidate_id, presented_to_company')
          .eq('company_id', companyId)
          .in('legacy_candidate_id', ids),
      ]);
      if (candidatesRes.error) throw candidatesRes.error;
      if (bridgeRes.error) throw bridgeRes.error;

      const presented = new Set(
        (bridgeRes.data ?? []).filter((b) => b.presented_to_company === true).map((b) => b.legacy_candidate_id as string)
      );
      const result: Record<string, { status: string; presented: boolean }> = {};
      for (const c of candidatesRes.data ?? []) {
        result[c.id as string] = { status: c.status as string, presented: presented.has(c.id as string) };
      }
      res.json(result);
    } catch (err) {
      logger.error('Error consultando decisiones de candidatos', { error: describeError(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/candidates/:id - Detalle de un candidato
router.get(
  '/:id',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.locals?.companyId;
      if (!companyId) {
        res.status(403).json({ error: 'Usuario sin empresa asignada' });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from('candidates')
        .select(CANDIDATE_FIELDS)
        .eq('id', req.params.id)
        .eq('company_id', companyId)
        .single();

      if (error || !data) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }

      res.json(data);
    } catch (err) {
      logger.error('Error obteniendo candidato', { error: describeError(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// PATCH /api/candidates/:id/present - Reclutador aprueba presentar el
// candidato a la empresa (habilita el Dashboard y el histórico de Empresa).
// :id es el candidato legado (candidates.id), el mismo que usa el Kanban;
// la relación en company_candidates se crea aquí si todavía no existía.
router.patch(
  '/:id/present',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.locals?.companyId;
      const userId = req.locals?.user?.id;
      const role = req.locals?.profile?.role;

      if (!companyId || !userId) {
        res.status(403).json({ error: 'Usuario sin empresa asignada' });
        return;
      }
      if (role !== 'recruiter') {
        res.status(403).json({ error: 'Solo un reclutador puede presentar candidatos a la empresa' });
        return;
      }

      const { data: candidate, error: fetchError } = await supabaseAdmin
        .from('candidates')
        .select('id, status, source')
        .eq('id', req.params.id)
        .eq('company_id', companyId)
        .single();

      if (fetchError || !candidate) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }

      await markPresented(companyId, candidate, candidate.status as CandidateStatus, userId);

      const { data: updated, error: readError } = await supabaseAdmin
        .from('company_candidates')
        .select('id, presented_to_company, presented_at, presented_by')
        .eq('company_id', companyId)
        .eq('legacy_candidate_id', candidate.id)
        .single();
      if (readError) throw readError;

      logger.info('Candidato presentado a la empresa', {
        candidateId: candidate.id,
        companyId,
        recruiterId: userId,
      });

      res.json(updated);
    } catch (err) {
      logger.error('Error presentando candidato a la empresa', { error: describeError(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// PATCH /api/candidates/:id/decision - El reclutador aprueba, deja en seguimiento o rechaza.
//   aprobar     → lo ve la empresa en su lista de aceptados (presented_to_company = true)
//   seguimiento → se sigue considerando sin descartarlo; sale de la lista de aceptados
//   rechazar → estado 'rechazado' (terminal); sale de la lista de aceptados
// Aprobar no contacta al candidato: 'en_contacto' (entrevista por n8n) es otra acción.
router.patch(
  '/:id/decision',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.locals?.companyId;
      const userId = req.locals?.user?.id;
      const role = req.locals?.profile?.role;

      if (!companyId || !userId) {
        res.status(403).json({ error: 'Usuario sin empresa asignada' });
        return;
      }
      if (role !== 'recruiter') {
        res.status(403).json({ error: 'Solo un reclutador puede decidir sobre un candidato' });
        return;
      }
      if (!uuidSchema.safeParse(req.params.id).success) {
        res.status(400).json({ error: 'Id de candidato inválido' });
        return;
      }
      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'decision debe ser: aprobar, seguimiento o rechazar' });
        return;
      }
      const { decision, reason } = parsed.data;

      // La empresa sale siempre del token: un id de otra empresa da 404
      const { data: current, error: fetchError } = await supabaseAdmin
        .from('candidates')
        .select('id, status, source')
        .eq('id', req.params.id)
        .eq('company_id', companyId)
        .single();

      if (fetchError || !current) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }

      const fromStatus = current.status as CandidateStatus;

      if (fromStatus === 'rechazado' && decision !== 'rechazar') {
        res.status(409).json({ error: 'Un candidato rechazado no se puede reactivar' });
        return;
      }

      const { data: bridge } = await supabaseAdmin
        .from('company_candidates')
        .select('presented_to_company, company_decision')
        .eq('company_id', companyId)
        .eq('legacy_candidate_id', current.id)
        .maybeSingle();
      const wasPresented = bridge?.presented_to_company === true;

      // La empresa ya contrató o descartó: el reclutador no puede cambiar ni retirar al candidato
      if (bridge?.company_decision && bridge.company_decision !== 'pendiente') {
        res.status(409).json({ error: COMPANY_DECIDED_MESSAGE });
        return;
      }

      const toStatus: CandidateStatus =
        decision === 'rechazar' ? 'rechazado'
        : decision === 'seguimiento' ? 'seguimiento'
        : fromStatus;

      // Repetir la misma decisión no duplica historial ni vuelve a escribir
      const alreadyApplied = decision === 'aprobar'
        ? wasPresented && toStatus === fromStatus
        : toStatus === fromStatus && !wasPresented;
      if (alreadyApplied) {
        res.json({ id: current.id, status: fromStatus, presented: wasPresented, unchanged: true });
        return;
      }

      if (toStatus !== fromStatus) {
        if (!ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
          res.status(400).json({ error: `Transición no permitida: ${fromStatus} → ${toStatus}` });
          return;
        }

        const { error: updateError } = await supabaseAdmin
          .from('candidates')
          .update({ status: toStatus, updated_at: new Date().toISOString() })
          .eq('id', current.id)
          .eq('company_id', companyId);
        if (updateError) throw updateError;

        const { error: historyError } = await supabaseAdmin
          .from('candidate_status_history')
          .insert({
            candidate_id: current.id,
            from_status: fromStatus,
            to_status: toStatus,
            changed_by: userId,
            reason: reason ?? null,
          });
        if (historyError) {
          logger.error('Error registrando historial de decisión', { candidateId: current.id, error: historyError.message });
        }
      }

      // Lista de la empresa: solo entra al aprobar; seguimiento y rechazo la dejan.
      // Cada paso es reintentable: repetir la decisión completa lo que falte.
      if (decision === 'aprobar') {
        await markPresented(companyId, { id: current.id, source: current.source }, toStatus, userId);
      } else {
        const { error: bridgeError } = await supabaseAdmin
          .from('company_candidates')
          .update({ presented_to_company: false, status: toStatus })
          .eq('company_id', companyId)
          .eq('legacy_candidate_id', current.id);
        if (bridgeError) throw bridgeError;
      }

      logger.info('Decisión del reclutador sobre candidato', {
        candidateId: current.id,
        companyId,
        recruiterId: userId,
        decision,
        fromStatus,
        toStatus,
      });

      res.json({ id: current.id, status: toStatus, presented: decision === 'aprobar' });
    } catch (err) {
      logger.error('Error aplicando decisión sobre candidato', { error: describeError(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// PATCH /api/candidates/:id/status - Cambiar estado (dispara entrevista en 'en_contacto')
router.patch(
  '/:id/status',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.locals?.companyId;
      const userId = req.locals?.user?.id;
      if (!companyId || !userId) {
        res.status(403).json({ error: 'Usuario sin empresa asignada' });
        return;
      }

      const { status, reason } = req.body as { status?: string; reason?: string };

      if (!status || !VALID_STATUSES.includes(status as CandidateStatus)) {
        res.status(400).json({ error: `status debe ser uno de: ${VALID_STATUSES.join(', ')}` });
        return;
      }

      // Verificar propiedad y estado actual
      const { data: current, error: fetchError } = await supabaseAdmin
        .from('candidates')
        .select('id, full_name, email, position, status, company_id')
        .eq('id', req.params.id)
        .eq('company_id', companyId)
        .single();

      if (fetchError || !current) {
        res.status(404).json({ error: 'Candidato no encontrado' });
        return;
      }

      const fromStatus = current.status as CandidateStatus;
      const toStatus = status as CandidateStatus;

      // La empresa ya contrató o descartó: el pipeline del reclutador deja de cambiar
      const { data: decidedBridge } = await supabaseAdmin
        .from('company_candidates')
        .select('company_decision')
        .eq('company_id', companyId)
        .eq('legacy_candidate_id', current.id)
        .maybeSingle();
      if (decidedBridge?.company_decision && decidedBridge.company_decision !== 'pendiente') {
        res.status(409).json({ error: COMPANY_DECIDED_MESSAGE });
        return;
      }

      if (fromStatus === toStatus) {
        res.json({ ...current, status: toStatus, unchanged: true });
        return;
      }

      const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
      if (!allowed.includes(toStatus)) {
        res.status(400).json({
          error: `Transición no permitida: ${fromStatus} → ${toStatus}`,
        });
        return;
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('candidates')
        .update({ status: toStatus, updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('company_id', companyId)
        .select(CANDIDATE_FIELDS)
        .single();

      if (updateError) {
        res.status(400).json({ error: updateError.message });
        return;
      }

      // candidate_status_history es la fuente única del historial (la consume la UI).
      // candidate_status_audit quedó deprecada en la migración 010.
      const { error: historyError } = await supabaseAdmin
        .from('candidate_status_history')
        .insert({
          candidate_id: current.id,
          from_status: fromStatus,
          to_status: toStatus,
          changed_by: userId,
          reason: reason ?? null,
        });

      if (historyError) {
        logger.error('Error registrando historial de estado', {
          candidateId: current.id,
          error: historyError.message,
        });
      }

      // Rechazar saca al candidato de la lista de aceptados de la empresa, igual que la
      // decisión del reclutador (no quedan dos caminos con resultados distintos).
      if (toStatus === 'rechazado') {
        const { error: bridgeError } = await supabaseAdmin
          .from('company_candidates')
          .update({ presented_to_company: false, status: toStatus })
          .eq('company_id', companyId)
          .eq('legacy_candidate_id', current.id);
        if (bridgeError) {
          logger.error('Error sincronizando la lista de la empresa', { candidateId: current.id, error: bridgeError.message });
        }
      }

      // Al pasar a 'en_contacto': n8n agenda entrevista y envía email
      if (toStatus === 'en_contacto') {
        n8nService
          .triggerInterviewRequest(companyId, userId, {
            id: current.id,
            full_name: current.full_name,
            email: current.email,
            position: current.position,
          })
          .catch((err) => {
            logger.error('Error disparando webhook de entrevista', { error: describeError(err) });
          });
      }

      logger.info('Estado de candidato actualizado', {
        candidateId: current.id,
        fromStatus,
        toStatus,
        userId,
      });

      res.json(updated);
    } catch (err) {
      logger.error('Error actualizando estado', { error: describeError(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

export default router;
