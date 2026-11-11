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

const mockUpsert = vi.fn();
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (v: unknown) => void) => resolve(selectResult),
        upsert: (rows: unknown, opts: unknown) => {
          mockUpsert(rows, opts);
          return Promise.resolve({ error: null });
        },
      };
      return chain;
    },
  }),
}));

import consentRouter from './consent';
import { CONSENT_VERSION } from '../services/consent';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: AuthenticatedRequest, _res, next) => {
    req.locals = { user: { id: 'user-1', email: 'u@test.co' }, profile: { id: 'user-1', role: 'recruiter' } };
    next();
  });
  a.use('/api/consent', consentRouter);
  return a;
}

describe('/api/consent', () => {
  beforeEach(() => {
    mockUpsert.mockClear();
    selectResult = { data: [], error: null };
  });

  it('indica que falta aceptar si no hay filas de la versión vigente', async () => {
    const res = await request(app()).get('/api/consent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: false, version: CONSENT_VERSION });
  });

  it('da por aceptado cuando están los dos documentos', async () => {
    selectResult = { data: [{ document: 'privacy' }, { document: 'terms' }], error: null };
    const res = await request(app()).get('/api/consent');
    expect(res.body.accepted).toBe(true);
  });

  it('no bloquea si la tabla no existe todavía', async () => {
    selectResult = { data: null, error: { message: 'relation "consents" does not exist' } };
    const res = await request(app()).get('/api/consent');
    expect(res.body.accepted).toBe(true);
    expect(res.body.unavailable).toBe(true);
  });

  it('rechaza la aceptación sin la casilla marcada', async () => {
    const res = await request(app()).post('/api/consent').send({ accept: false, version: CONSENT_VERSION });
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rechaza una versión distinta a la vigente', async () => {
    const res = await request(app()).post('/api/consent').send({ accept: true, version: '2000-01-01' });
    expect(res.status).toBe(409);
  });

  it('guarda una fila por documento con versión, IP y navegador', async () => {
    const res = await request(app())
      .post('/api/consent')
      .set('x-client-ip', '203.0.113.7, 10.0.0.1')
      .set('x-client-user-agent', 'Navegador de prueba')
      .send({ accept: true, version: CONSENT_VERSION });
    expect(res.status).toBe(201);
    const [rows, opts] = mockUpsert.mock.calls[0];
    expect(rows).toEqual([
      { user_id: 'user-1', document: 'privacy', version: CONSENT_VERSION, ip: '203.0.113.7', user_agent: 'Navegador de prueba' },
      { user_id: 'user-1', document: 'terms', version: CONSENT_VERSION, ip: '203.0.113.7', user_agent: 'Navegador de prueba' },
    ]);
    expect(opts).toMatchObject({ onConflict: 'user_id,document,version' });
  });
});
