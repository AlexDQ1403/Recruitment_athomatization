import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const correlationId = getCorrelationId(req);

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Validation failed',
      issues: err.flatten().fieldErrors,
      correlationId,
    });
  }

  if (err instanceof AppError) {
    logger.warn(err.message, { correlationId, code: err.code });
    return res.status(err.statusCode).json({ error: err.message, correlationId });
  }

  logger.error('Unhandled error', { correlationId, error: err });
  return res.status(500).json({ error: 'Error interno del servidor', correlationId });
};
