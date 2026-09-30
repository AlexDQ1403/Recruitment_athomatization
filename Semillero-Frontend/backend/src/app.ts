import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { correlationMiddleware } from './utils/tracing';
import { errorHandler } from './middlewares/errorHandler';
import { companyAuthMiddleware } from './middlewares/companyAuth';
import { requireRole, requireCompany } from './middlewares/requireRole';
import { config } from './config';
import chatRouter from './routes/chat';
import n8nWebhookRouter from './routes/n8n-webhook';
import recruiterRouter from './routes/recruiters';
import candidatesRouter from './routes/candidates';
import reportsRouter from './routes/reports';
import registerRouter from './routes/register';
import candidatePortalRouter from './routes/candidate-portal';
import sessionRouter from './routes/session';
import companyCandidatesRouter from './routes/company-candidates';
import accountRouter from './routes/account';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationMiddleware);

  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Registro público (solo empresas y candidatos pueden crear cuenta)
  app.use('/api/register', registerRouter);

  // Portal del candidato (exige rol 'candidato', sin empresa asociada)
  app.use('/api/me', candidatePortalRouter);

  // Sesión: cualquier rol autenticado (auditoría de entrada y salida)
  app.use('/api/session', sessionRouter);

  // Rutas de empresa: autenticadas, con empresa y vetadas a candidatos
  // Búsqueda por chat: solo reclutadores. Empresa no debe tener esta
  // funcionalidad (ver sección 2 del pedido de producto).
  app.use('/api/chat', companyAuthMiddleware, requireRole('recruiter'), requireCompany, chatRouter);
  app.use('/api/recruiters', companyAuthMiddleware, requireRole('empresa'), requireCompany, recruiterRouter);
  app.use('/api/candidates', companyAuthMiddleware, requireRole('empresa', 'recruiter'), requireCompany, candidatesRouter);
  // Bandeja de la empresa: solo candidatos que un reclutador aprobó explícitamente.
  app.use('/api/company/candidates', companyAuthMiddleware, requireRole('empresa'), requireCompany, companyCandidatesRouter);
  app.use('/api/reports', companyAuthMiddleware, requireRole('empresa'), requireCompany, reportsRouter);
  // Perfil propio de empresa/reclutador (foto + para empresa, nombre y correo).
  app.use('/api/account', companyAuthMiddleware, requireRole('empresa', 'recruiter'), requireCompany, accountRouter);

  // Rutas sin autenticación (webhooks externos)
  app.use('/api/n8n-webhook', n8nWebhookRouter);

  app.use(errorHandler);
  app.use((_req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

  return app;
};
