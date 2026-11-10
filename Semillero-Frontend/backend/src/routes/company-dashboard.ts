import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { loadInsightsData } from '../services/insightsData';
import { computeCompanyInsights } from '../services/companyInsights';

// Montado en /api/company/dashboard (solo rol empresa). Ver services/companyInsights.ts
const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const describeError = (err: unknown) => {
  if (err instanceof Error) return err.message;
  const e = err as { code?: unknown; message?: unknown } | null;
  return JSON.stringify({ code: e?.code, message: e?.message });
};

/** GET /api/company/dashboard — decisiones pendientes, vacantes y equipo de la empresa del token. */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const companyId = req.locals?.companyId;
  if (!companyId) {
    res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
    return;
  }
  try {
    const data = await loadInsightsData(supabaseAdmin, companyId, (what, error) =>
      logger.warn(`Dashboard de empresa: sin ${what} (¿migración pendiente?)`, { correlationId: getCorrelationId(req), error: describeError(error) }));
    res.json(computeCompanyInsights(data));
  } catch (err) {
    logger.error('Error armando el dashboard de la empresa', { correlationId: getCorrelationId(req), error: describeError(err) });
    const code = String((err as { code?: unknown } | null)?.code);
    if (['PGRST204', 'PGRST205', '42703', '42P01'].includes(code)) {
      res.status(503).json({ error: 'El dashboard no está disponible por una actualización pendiente de la base de datos. Avisa al administrador.' });
      return;
    }
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
