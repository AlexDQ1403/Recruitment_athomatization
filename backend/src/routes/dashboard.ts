import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { computeInsights } from '../services/recruiterInsights';
import { loadInsightsData } from '../services/insightsData';

// Ver specs/dashboard_reclutador_design.md y services/recruiterInsights.ts
const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const querySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
  vacancy_id: z.string().uuid().optional(),
  source: z.enum(['scraping', 'applicant', 'internal']).optional(),
});

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  const e = err as { code?: unknown; message?: unknown } | null;
  return JSON.stringify({ code: e?.code, message: e?.message });
}

/** GET /api/dashboard/recruiter?period=30d&vacancy_id=…&source=scraping */
router.get('/recruiter', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const companyId = req.locals?.companyId;
  if (!companyId) {
    res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
    return;
  }
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: 'Filtros inválidos: period (7d, 30d, 90d, all), vacancy_id (uuid), source (scraping, applicant, internal)' });
    return;
  }

  try {
    const data = await loadInsightsData(supabaseAdmin, companyId, (what, error) =>
      logger.warn(`Dashboard: sin ${what} (¿migración pendiente?)`, { correlationId: getCorrelationId(req), error: describeError(error) }));
    const insights = computeInsights(data, { period: query.data.period, vacancyId: query.data.vacancy_id, source: query.data.source });
    res.json(insights);
  } catch (err) {
    logger.error('Error armando el dashboard del reclutador', { correlationId: getCorrelationId(req), error: describeError(err) });
    const code = String((err as { code?: unknown } | null)?.code);
    if (['PGRST204', 'PGRST205', '42703', '42P01'].includes(code)) {
      res.status(503).json({ error: 'El dashboard no está disponible por una actualización pendiente de la base de datos. Avisa al administrador.' });
      return;
    }
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
