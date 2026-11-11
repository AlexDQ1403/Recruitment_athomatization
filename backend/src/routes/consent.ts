import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { getCorrelationId } from '../utils/tracing';
import { CONSENT_VERSION, hasCurrentConsent, recordConsent } from '../services/consent';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** GET /api/consent — si la cuenta ya aceptó la versión vigente */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.locals!.user!.id;
  const { accepted, error } = await hasCurrentConsent(supabaseAdmin, userId);
  if (error) {
    // Sin la tabla (migración 033 pendiente) no bloqueamos a nadie
    logger.error('Error consultando autorización', { correlationId: getCorrelationId(req), userId, error });
    res.json({ accepted: true, version: CONSENT_VERSION, unavailable: true });
    return;
  }
  res.json({ accepted, version: CONSENT_VERSION });
});

const acceptSchema = z.object({
  accept: z.literal(true),
  version: z.string().max(20),
});

/** POST /api/consent — acepta la Política de Datos y los Términos vigentes */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Debes aceptar la Política de Tratamiento de Datos y los Términos' });
    return;
  }
  if (parsed.data.version !== CONSENT_VERSION) {
    res.status(409).json({ error: 'Los documentos cambiaron. Recarga la página para ver la versión vigente.' });
    return;
  }

  const userId = req.locals!.user!.id;
  const { error } = await recordConsent(supabaseAdmin, userId, req);
  if (error) {
    logger.error('Error guardando autorización', { correlationId: getCorrelationId(req), userId, error });
    res.status(500).json({ error: 'No pudimos guardar tu aceptación. Inténtalo de nuevo.' });
    return;
  }

  logger.info('Autorización de datos aceptada', { correlationId: getCorrelationId(req), userId, version: CONSENT_VERSION });
  res.status(201).json({ accepted: true, version: CONSENT_VERSION });
});

export default router;
