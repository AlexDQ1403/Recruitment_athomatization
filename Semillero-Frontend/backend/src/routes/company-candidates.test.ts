import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

vi.mock('../config', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Tabla -> builder de la cadena fluida que espera ese endpoint.
const tableResponses: Record<string, { data: unknown; error?: unknown; count?: number }> = {};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const response = tableResponses[table] ?? { data: [] };
      const chain: Record<string, unknown> = {};
      const methods = ['select', 'eq', 'in', 'order', 'range'];
      for (const m of methods) {
        chain[m] = vi.fn(() => chain);
      }
      // range() y (en algunos casos) el último eq() resuelven la promesa
      chain.range = vi.fn(() => Promise.resolve(response));
      chain.then = (resolve: (v: unknown) => void) => resolve(response);
      return chain;
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
  const { default: companyCandidatesRouter } = await import('./company-candidates');
  app.use('/api/company/candidates', companyCandidatesRouter);
  return app;
};

describe('GET /api/company/candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(tableResponses).forEach((k) => delete tableResponses[k]);
  });

  it('devuelve 403 si el usuario no tiene empresa asociada', async () => {
    const app = await buildApp({ user: { id: 'u1', email: 'e@test.com' } });
    const res = await request(app).get('/api/company/candidates');
    expect(res.status).toBe(403);
  });

  it('devuelve lista vacía cuando no hay candidatos presentados', async () => {
    tableResponses.company_candidates = { data: [], count: 0 };
    const app = await buildApp({
      user: { id: 'u1', email: 'e@test.com' },
      profile: { id: 'u1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app).get('/api/company/candidates');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates: [], total: 0, limit: 50, offset: 0 });
  });
});
