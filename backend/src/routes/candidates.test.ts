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

vi.mock('../services/n8nService', () => ({
  triggerInterviewRequest: vi.fn(),
}));

const mockInsert = vi.fn();
// Vacante del candidato heredado: presentar a la empresa la exige
let legacyVacancyId: string | null = 'vac-1';
const mockUpsert = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'candidates') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'legacy-1', status: 'seguimiento', source: 'internal', vacancy_id: legacyVacancyId },
            error: null,
          }),
        };
      }
      if (table === 'company_candidates') {
        return {
          // La base real rechaza upsert sobre esta clave (índice único parcial): nunca debe usarse
          upsert: mockUpsert,
          insert: mockInsert.mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({
            data: { id: 'bridge-1', presented_to_company: true, presented_at: '2026-01-01', presented_by: 'recruiter-1' },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
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
  const { default: candidatesRouter } = await import('./candidates');
  app.use('/api/candidates', candidatesRouter);
  return app;
};

describe('PATCH /api/candidates/:id/present', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza con 403 si el rol no es recruiter (empresa no puede presentar candidatos)', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'e@test.com' },
      profile: { id: 'u1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app).patch('/api/candidates/legacy-1/present');
    expect(res.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('sin vacante no se puede presentar a la empresa (409, igual que en el chat)', async () => {
    legacyVacancyId = null;
    const app = await buildApp({ user: { id: 'recruiter-1', email: 'r@test.com' }, companyId: 'company-1', profile: { id: 'recruiter-1', role: 'recruiter' } } as AuthenticatedRequest['locals']);
    const res = await request(app).patch('/api/candidates/legacy-1/present');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('vacancy_required');
    expect(mockInsert).not.toHaveBeenCalled();
    legacyVacancyId = 'vac-1';
  });

  it('permite a recruiter presentar el candidato y crea/actualiza la relación', async () => {
    const app = await buildApp({
      user: { id: 'recruiter-1', email: 'r@test.com' },
      profile: { id: 'recruiter-1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app).patch('/api/candidates/legacy-1/present');
    expect(res.status).toBe(200);
    expect(res.body.presented_to_company).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'company-1',
        legacy_candidate_id: 'legacy-1',
        presented_to_company: true,
        presented_by: 'recruiter-1',
      })
    );
    expect(mockUpsert).not.toHaveBeenCalled(); // el índice único es parcial: upsert da 42P10
  });
});
