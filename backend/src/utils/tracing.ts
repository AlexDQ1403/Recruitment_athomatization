import { Request, Response, NextFunction } from 'express';
import { correlationStorage } from './logger';

export const correlationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  correlationStorage.run(correlationId, () => next());
};

export const getCorrelationId = (req?: Request): string | undefined => {
  if (req) return req.headers['x-correlation-id'] as string;
  return correlationStorage.getStore();
};
