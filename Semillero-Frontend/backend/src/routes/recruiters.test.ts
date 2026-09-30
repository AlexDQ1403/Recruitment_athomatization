import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

vi.mock('../config', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockUpdate = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'recruiter-1', company_id: 'company-1', role: 'recruiter' },
            error: null,
          }),
          update: (payload: Record<string, unknown>) => {
            mockUpdate(payload);
            return {
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'recruiter-1', full_name: 'Nuevo Nombre', role: 'recruiter' },
                error: null,
              }),
            };
          },
        };
      }
      if (table === 'recruiter_audit_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    },
  }),
}));

const buildApp = async (locals: AuthenticatedRequest['locals']) => {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & AuthenticatedRequest, _res, next) => {
    req.locals = locals;
    next();
  });
  const { default: recruiterRouter } = await import('./recruiters');
  app.use('/api/recruiters', recruiterRouter);
  return app;
};

describe('PATCH /api/recruiters/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignora "role" en el body: una empresa no puede escalar el rol de un reclutador manipulando el request', async () => {
    const app = await buildApp({
      user: { id: 'empresa-1', email: 'e@test.com' },
      profile: { id: 'empresa-1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });

    const res = await request(app)
      .patch('/api/recruiters/recruiter-1')
      .send({ full_name: 'Nuevo Nombre', role: 'superAdmin', company_id: 'otra-empresa' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ full_name: 'Nuevo Nombre' });
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ role: expect.anything() }));
  });

  it('devuelve 403 si quien llama no es empresa', async () => {
    const app = await buildApp({
      user: { id: 'recruiter-1', email: 'r@test.com' },
      profile: { id: 'recruiter-1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });

    const res = await request(app).patch('/api/recruiters/recruiter-1').send({ role: 'empresa' });
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
