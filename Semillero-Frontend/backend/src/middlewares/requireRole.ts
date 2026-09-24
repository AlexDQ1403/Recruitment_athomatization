import { Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from './companyAuth';

export type AppRole = 'empresa' | 'recruiter' | 'candidato' | 'superAdmin';

/**
 * Exige que el usuario autenticado tenga uno de los roles indicados.
 * Se aplica SIEMPRE después de companyAuthMiddleware, que es quien resuelve el
 * perfil desde la base de datos. El cliente nunca declara su rol.
 */
export const requireRole = (...roles: AppRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const role = req.locals?.profile?.role as AppRole | undefined;

    if (!role) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    if (!roles.includes(role)) {
      logger.warn('Acceso denegado por rol', {
        userId: req.locals?.user?.id,
        role,
        required: roles,
        path: req.originalUrl,
      });
      res.status(403).json({ error: 'No tienes permisos para esta acción' });
      return;
    }

    next();
  };
};

/**
 * Exige que el usuario esté asociado a una empresa.
 * Los candidatos no lo están por diseño, así que las rutas de empresa la usan
 * para no tener que comprobarlo en cada handler.
 */
export const requireCompany = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.locals?.companyId) {
    res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
    return;
  }
  next();
};
