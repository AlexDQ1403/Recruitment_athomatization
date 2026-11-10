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

  it('recruiter no puede cambiar su correo (whitelist ignora el campo)', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'r@test.com' },
      profile: { id: 'u1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ email: 'otro@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Nada que actualizar');
    expect(mockProfilesUpdate).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('recruiter edita sus datos personales; el correo del body se descarta', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'r@test.com' },
      profile: { id: 'u1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ full_name: 'Nombre Nuevo', phone: '+57 300 123 4567', job_title: 'Reclutadora TI', email: 'otro@test.com' });

    expect(res.status).toBe(200);
    expect(mockProfilesUpdate).toHaveBeenCalledWith({
      full_name: 'Nombre Nuevo', phone: '+57 300 123 4567', job_title: 'Reclutadora TI',
    });
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('teléfono vacío se guarda como null', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'r@test.com' },
      profile: { id: 'u1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app).patch('/api/account/profile').send({ phone: '' });

    expect(res.status).toBe(200);
    expect(mockProfilesUpdate).toHaveBeenCalledWith({ phone: null });
  });

  it('rechaza un teléfono con letras', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'r@test.com' },
      profile: { id: 'u1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app).patch('/api/account/profile').send({ phone: 'llámame' });

    expect(res.status).toBe(400);
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

  it('superAdmin (sin empresa) puede editar su nombre y foto', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'a@test.com' },
      profile: { id: 'u1', role: 'superAdmin' },
    });
    const res = await request(app)
      .patch('/api/account/profile')
      .send({ full_name: 'Admin Nuevo', role: 'empresa' });

    expect(res.status).toBe(200);
    expect(mockProfilesUpdate).toHaveBeenCalledWith({ full_name: 'Admin Nuevo' });
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

describe('PATCH /api/account/company', () => {
  beforeEach(() => vi.clearAllMocks());

  it('el reclutador no puede editar la ficha de la empresa', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'r@test.com' },
      profile: { id: 'u1', role: 'recruiter', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app).patch('/api/account/company').send({ name: 'Otra' });

    expect(res.status).toBe(403);
  });

  it('rechaza un sitio web sin protocolo', async () => {
    const app = await buildApp({
      user: { id: 'u1', email: 'e@test.com' },
      profile: { id: 'u1', role: 'empresa', company_id: 'company-1' },
      companyId: 'company-1',
    });
    const res = await request(app).patch('/api/account/company').send({ website: 'kmella.co' });

    expect(res.status).toBe(400);
  });
});
