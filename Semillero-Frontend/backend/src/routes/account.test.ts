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

const mockUpdateUserById = vi.fn().mockResolvedValue({ error: null });
const mockProfilesUpdate = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { updateUserById: mockUpdateUserById } },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          update: (payload: Record<string, unknown>) => {
            mockProfilesUpdate(payload);
            return {
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'u1', full_name: 'Nuevo Nombre', email: 'nuevo@test.com', avatar_url: null, role: 'empresa' },
                error: null,
              }),
            };
          },
        };
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
  const { default: accountRouter } = await import('./account');
  app.use('/api/account', accountRouter);
  return app;
};

describe('PATCH /api/account/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUserById.mockResolvedValue({ error: null });
  });

  it('recruiter no puede cambiar full_name ni email (whitelist ignora esos campos)', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'r@test.com' },
      profile: { id: 'u1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ full_name: 'Nombre Nuevo', email: 'otro@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Nada que actualizar');
    expect(mockProfilesUpdate).not.toHaveBeenCalled();
  });

  it('empresa/recruiter no puede cambiar su propio rol vía este endpoint (role no está en el whitelist)', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'e@test.com' },
      profile: { id: 'u1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ role: 'superAdmin', company_id: 'other-company', full_name: 'Empresa Actualizada' });

    expect(res.status).toBe(200);
    // Solo full_name llega a profiles.update — role/company_id nunca se leen del body
    expect(mockProfilesUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ role: expect.anything(), company_id: expect.anything() })
    );
    expect(mockProfilesUpdate).toHaveBeenCalledWith({ full_name: 'Empresa Actualizada' });
  });

  it('empresa puede cambiar su correo y se sincroniza con auth.users', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'e@test.com' },
      profile: { id: 'u1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ email: 'nuevo@test.com' });

    expect(res.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith('u1', { email: 'nuevo@test.com', email_confirm: true });
  });

  it('devuelve 409 si el correo ya está en uso', async () => {
    mockUpdateUserById.mockResolvedValue({ error: { message: 'Email address already registered' } });
    const app = await buildApp({
      user: { id: 'u1', email: 'e@test.com' },
      profile: { id: 'u1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ email: 'duplicado@test.com' });

    expect(res.status).toBe(409);
  });

  it('rechaza formato de correo inválido con 400', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'e@test.com' },
      profile: { id: 'u1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ email: 'no-es-un-correo' });

    expect(res.status).toBe(400);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });
});
