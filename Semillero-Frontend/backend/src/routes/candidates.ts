import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import * as n8nService from '../services/n8nService';

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
      logger.error('Error listando candidatos', { error: String(err) });
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
      logger.error('Error obteniendo candidato', { error: String(err) });
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
            logger.error('Error disparando webhook de entrevista', { error: String(err) });
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
      logger.error('Error actualizando estado', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

export default router;
