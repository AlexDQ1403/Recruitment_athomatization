import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest, companyAuthMiddleware } from '../middlewares/companyAuth';
import { getCorrelationId } from '../utils/tracing';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Estas rutas se llaman una vez por inicio/cierre de sesión: un límite holgado
// basta para frenar un bucle accidental del cliente.
const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Un intento de acceso fallido no tiene token, así que esta ruta va ANTES del
// middleware de autenticación: en Express el orden de registro es el que manda.
const failedLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Lista blanca: el motivo se escribe al log, y aceptar texto libre permitiría
// inyectar saltos de línea para falsificar entradas (log injection).
const VALID_REASONS = new Set([
  'invalid_credentials',
  'email_not_confirmed',
  'rate_limited',
  'user_banned',
  'network',
  'unknown',
]);

/**
 * POST /api/session/failed-login  (público)
 *
 * Deja traza de un intento de acceso fallido para poder detectar picos de
 * fuerza bruta. NO recibe el correo ni la contraseña: solo el motivo, para no
 * acumular datos personales de quien simplemente se equivocó al escribir.
 *
 * Escribe únicamente al log de aplicación, no a la base de datos: siendo un
 * endpoint público, una tabla sería un vector para llenarla de basura.
 */
router.post('/failed-login', failedLoginLimiter, (req, res): void => {
  const raw = (req.body?.reason ?? '') as unknown;
  const reason = typeof raw === 'string' && VALID_REASONS.has(raw) ? raw : 'unknown';

  logger.warn('Intento de acceso fallido', {
    correlationId: getCorrelationId(req),
    reason,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 200) ?? null,
  });

  res.status(204).send();
});

router.use(companyAuthMiddleware, sessionLimiter);

/**
 * Registra el evento en recruiter_audit_log.
 * Solo aplica a usuarios de empresa: la tabla tiene FK a companies, y un
 * candidato no pertenece a ninguna. Nunca hace fallar la petición.
 */
async function auditSession(
  req: AuthenticatedRequest,
  action: 'login' | 'logout'
): Promise<void> {
  const companyId = req.locals?.companyId;
  const userId = req.locals?.user?.id;
  if (!companyId || !userId) return;

  // Con proxy delante, req.ip puede ser el del proxy; sirve como indicio, no
  // como prueba de origen.
  const { error } = await supabaseAdmin.from('recruiter_audit_log').insert({
    company_id: companyId,
    recruiter_id: userId,
    action,
    changed_by: userId,
    changes: { role: req.locals?.profile?.role },
    ip_address: req.ip ?? null,
  });

  if (error) {
    logger.error('Error auditando sesión', { action, userId, error: error.message });
  }
}

/**
 * POST /api/session/touch
 *
 * Marca el acceso del usuario. Lo llama el cliente tras autenticarse.
 * El id sale del token verificado por el middleware, nunca del body: así un
 * usuario no puede marcar el acceso de otro.
 */
router.post('/touch', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.locals!.user!.id;

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      logger.error('Error actualizando last_login', { userId, error: error.message });
    }

    await auditSession(req, 'login');

    logger.info('Sesión iniciada', {
      correlationId: getCorrelationId(req),
      userId,
      role: req.locals?.profile?.role,
    });

    res.status(204).send();
  } catch (err) {
    logger.error('Error en session/touch', { error: String(err) });
    // No es crítico para el usuario: no bloqueamos su entrada por esto
    res.status(204).send();
  }
});

/**
 * POST /api/session/logout
 *
 * Deja constancia del cierre de sesión. La invalidación del token la hace
 * Supabase desde el cliente (signOut); este endpoint es solo la traza de
 * auditoría, y por eso nunca devuelve error al cliente: si falla, el usuario
 * debe poder salir igualmente.
 */
router.post('/logout', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await auditSession(req, 'logout');

    logger.info('Sesión cerrada', {
      correlationId: getCorrelationId(req),
      userId: req.locals?.user?.id,
    });

    res.status(204).send();
  } catch (err) {
    logger.error('Error en session/logout', { error: String(err) });
    res.status(204).send();
  }
});

export default router;
