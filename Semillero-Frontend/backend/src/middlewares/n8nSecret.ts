import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';

/**
 * Autentica las peticiones entrantes de n8n con el secreto compartido
 * (cabecera X-N8N-Secret). Falla cerrado: sin secreto configurado → 503.
 */
export function n8nSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = config.N8N_WEBHOOK_SECRET;
  if (!expected) {
    logger.error('n8n webhook: N8N_WEBHOOK_SECRET no configurado, rechazando', {
      correlationId: getCorrelationId(req),
    });
    res.status(503).json({ error: 'Webhook no disponible' });
    return;
  }

  const received = req.header('X-N8N-Secret') ?? '';
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    logger.warn('n8n webhook: secreto inválido o ausente', {
      correlationId: getCorrelationId(req),
      ip: req.ip,
    });
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  next();
}
