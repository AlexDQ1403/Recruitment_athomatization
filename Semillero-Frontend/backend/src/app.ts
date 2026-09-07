import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { correlationMiddleware } from './utils/tracing';
import { errorHandler } from './middlewares/errorHandler';
import { companyAuthMiddleware } from './middlewares/companyAuth';
import { config } from './config';
import chatRouter from './routes/chat';
import n8nWebhookRouter from './routes/n8n-webhook';
import recruiterRouter from './routes/recruiters';
import candidatesRouter from './routes/candidates';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationMiddleware);

  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Rutas con autenticación company-scoped
  app.use('/api/chat', companyAuthMiddleware, chatRouter);
  app.use('/api/recruiters', recruiterRouter);
  app.use('/api/candidates', candidatesRouter);

  // Rutas sin autenticación (webhooks externos)
  app.use('/api/n8n-webhook', n8nWebhookRouter);

  app.use(errorHandler);
  app.use((_req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

  return app;
};
