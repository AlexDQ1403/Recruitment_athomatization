import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

export interface AuthenticatedRequest extends Request {
  locals?: {
    user?: { id: string; email: string };
    profile?: {
      id: string;
      role: string;
      full_name?: string;
      company_id?: string;
      suspended?: boolean;
    };
    companyId?: string;
  };
}

/**
 * Middleware que verifica token, obtiene profile, y adjunta a req.locals
 * USO: Aplicar a TODAS las rutas que requieren autenticación
 */
export const companyAuthMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    // 1. Verificar token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    // 2. Obtener profile con role + company_id + suspended
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, full_name, company_id, suspended')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      res.status(401).json({ error: 'Perfil no encontrado' });
      return;
    }

    // 3. Validar que no esté suspendido (excepto superAdmin)
    if (profile.suspended && profile.role !== 'superAdmin') {
      res.status(403).json({ error: 'Cuenta suspendida' });
      return;
    }

    // 4. Adjuntar a req.locals
    if (!req.locals) req.locals = {};
    req.locals.user = { id: user.id, email: user.email || '' };
    req.locals.profile = profile;
    req.locals.companyId = profile.company_id;

    next();
  } catch (err) {
    logger.error('companyAuthMiddleware error', { error: String(err) });
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
