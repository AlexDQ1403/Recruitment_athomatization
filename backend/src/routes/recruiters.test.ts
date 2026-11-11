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
    CORS_ORIGIN: 'https://app.test',
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockUpdate = vi.fn();
const mockInvite = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { inviteUserByEmail: (...a: unknown[]) => mockInvite(...a), deleteUser: vi.fn() } },
    from: (table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Acme SAS' }, error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          upsert: (payload: Record<string, unknown>) => {
            mockUpsert(payload);
            return Promise.resolve({ error: null });
          },
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

describe('POST /api/recruiters (invitación)', () => {
  const empresa = { profile: { role: 'empresa' }, companyId: 'company-1', user: { id: 'owner-1' } } as AuthenticatedRequest['locals'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvite.mockResolvedValue({ data: { user: { id: 'new-recruiter' } }, error: null });
  });

  it('invita por correo sin pedir contraseña: el reclutador la crea desde el enlace', async () => {
    const app = await buildApp(empresa);
    const res = await request(app).post('/api/recruiters').send({ email: ' Ana@Acme.co ', full_name: 'Ana Gómez' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'new-recruiter', email: 'ana@acme.co', invited: true });
    expect(mockInvite).toHaveBeenCalledWith('ana@acme.co', {
      redirectTo: 'https://app.test/reset-password?bienvenida=1',
      data: { full_name: 'Ana Gómez', role: 'recruiter', account_type: 'reclutador', company_name: 'Acme SAS' },
    });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-recruiter', role: 'recruiter', company_id: 'company-1' }));
  });

  it('correo ya registrado: lo dice claro y no crea perfil', async () => {
    mockInvite.mockResolvedValue({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } });
    const app = await buildApp(empresa);
    const res = await request(app).post('/api/recruiters').send({ email: 'ana@acme.co', full_name: 'Ana' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Ya existe una cuenta con ese correo');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('valida nombre y correo, y solo la empresa puede invitar', async () => {
    const app = await buildApp(empresa);
    expect((await request(app).post('/api/recruiters').send({ email: 'no-es-correo', full_name: 'Ana' })).status).toBe(400);
    const recruiterApp = await buildApp({ ...empresa, profile: { role: 'recruiter' } } as AuthenticatedRequest['locals']);
    expect((await request(recruiterApp).post('/api/recruiters').send({ email: 'ana@acme.co', full_name: 'Ana' })).status).toBe(403);
    expect(mockInvite).not.toHaveBeenCalled();
  });
});

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
