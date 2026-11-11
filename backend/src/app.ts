import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { correlationMiddleware } from './utils/tracing';
import { errorHandler } from './middlewares/errorHandler';
import { companyAuthMiddleware, AuthenticatedRequest } from './middlewares/companyAuth';
import { requireRole, requireCompany } from './middlewares/requireRole';
import { n8nSecret } from './middlewares/n8nSecret';
import { config } from './config';
import chatRouter from './routes/chat';
import n8nWebhookRouter from './routes/n8n-webhook';
import recruiterRouter from './routes/recruiters';
import candidatesRouter from './routes/candidates';
import candidateProfilesRouter from './routes/candidate-profiles';
import vacanciesRouter from './routes/vacancies';
import vacancyApplicantsRouter from './routes/vacancy-applicants';
import dashboardRouter from './routes/dashboard';
import reportsRouter from './routes/reports';
import registerRouter from './routes/register';
import candidatePortalRouter from './routes/candidate-portal';
import sessionRouter from './routes/session';
import companyCandidatesRouter from './routes/company-candidates';
import companyDashboardRouter from './routes/company-dashboard';
import accountRouter from './routes/account';
import consentRouter from './routes/consent';

const n8nWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes' },
});

export const createApp = () => {
  const app = express();
  // Detrás de un proxy (Render): la IP real del cliente para el límite de peticiones
  if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationMiddleware);

  // Webhook entrante de n8n: límite de tasa propio + secreto compartido
  app.use('/api/n8n-webhook', n8nWebhookLimiter, n8nSecret, n8nWebhookRouter);

  // Por IP: una oficina o universidad comparte IP, así que el tope es holgado
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.RATE_LIMIT_PER_15MIN,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes: espera un momento e inténtalo de nuevo.' },
  }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Registro público (solo empresas y candidatos pueden crear cuenta)
  app.use('/api/register', registerRouter);

  // Portal del candidato (exige rol 'candidato', sin empresa asociada)
  app.use('/api/me', candidatePortalRouter);

  // Sesión: cualquier rol autenticado (auditoría de entrada y salida)
  app.use('/api/session', sessionRouter);

  // Autorización de tratamiento de datos: cualquier rol autenticado (Ley 1581 de 2012)
  app.use('/api/consent', companyAuthMiddleware, consentRouter);

  // Rutas de empresa: autenticadas, con empresa y vetadas a candidatos
  app.use('/api/chat', companyAuthMiddleware, requireRole('recruiter'), requireCompany, chatRouter);
  app.use('/api/recruiters', companyAuthMiddleware, requireRole('empresa'), requireCompany, recruiterRouter);
  app.use('/api/candidates', companyAuthMiddleware, requireRole('empresa', 'recruiter'), requireCompany, candidatesRouter);
  // Perfil completo: el reclutador lo ve todo y contacta/rechaza
  app.use('/api/candidate-profiles', companyAuthMiddleware, requireRole('recruiter', 'empresa'), requireCompany, candidateProfilesRouter);
  // Dashboard del reclutador: datos de su empresa, calculados en el servidor
  app.use('/api/dashboard', companyAuthMiddleware, requireRole('recruiter'), requireCompany, dashboardRouter);
  // Postulantes de una vacante y cambio de su estado (más específico: va antes)
  app.use('/api/vacancies/:vacancyId/applicants', companyAuthMiddleware, requireRole('empresa', 'recruiter'), requireCompany, vacancyApplicantsRouter);
  // Publicar vacantes: la empresa sale de la sesión (nunca del formulario)
  app.use('/api/vacancies', companyAuthMiddleware, requireRole('empresa', 'recruiter'), requireCompany, vacanciesRouter);
  // Bandeja de la empresa: solo candidatos que un reclutador aprobó explícitamente.
  app.use('/api/company/candidates', companyAuthMiddleware, requireRole('empresa'), requireCompany, companyCandidatesRouter);
  // Dashboard de la empresa: decisiones pendientes, salud de vacantes y actividad del equipo
  app.use('/api/company/dashboard', companyAuthMiddleware, requireRole('empresa'), requireCompany, companyDashboardRouter);
  app.use('/api/reports', companyAuthMiddleware, requireRole('empresa'), requireCompany, reportsRouter);
  // Perfil propio de empresa/reclutador (datos personales; la empresa además su correo y su ficha)
  app.use(
    '/api/account',
    companyAuthMiddleware,
    requireRole('empresa', 'recruiter', 'superAdmin'),
    (req: AuthenticatedRequest, res, next) => (req.locals?.profile?.role === 'superAdmin' ? next() : requireCompany(req, res, next)),
    accountRouter
  );

  app.use(errorHandler);
  app.use((_req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

  return app;
};
