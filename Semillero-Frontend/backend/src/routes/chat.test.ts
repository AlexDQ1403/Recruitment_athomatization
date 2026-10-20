import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock config antes de importar el router
vi.mock('../config', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    OPENROUTER_API_KEY: 'sk-or-test',
    N8N_WEBHOOK_URL: undefined,
    CORS_ORIGIN: 'http://localhost:3002',
    PORT: 3001,
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
  },
}));

// Mock supabase
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../utils/tracing', () => ({
  correlationMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getCorrelationId: () => 'test-correlation-id',
}));

const mockNoResults = vi.fn().mockResolvedValue(undefined);
const mockShortage = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/n8nService', () => ({
  triggerNoSearchResults: (...args: unknown[]) => mockNoResults(...args),
  triggerCandidateShortage: (...args: unknown[]) => mockShortage(...args),
  isN8nConfigured: () => true,
}));

type Result = { data?: unknown; error?: unknown; count?: number };

/** Cadena fluida de Supabase: cada método devuelve la cadena y es "await-able". */
function chain(result: Result) {
  const res = { error: null, ...result };
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'not', 'in', 'insert', 'update']) {
    c[m] = vi.fn(() => c);
  }
  c.single = vi.fn(() => Promise.resolve(res));
  c.maybeSingle = vi.fn(() => Promise.resolve(res));
  c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko);
  return c;
}

/** Un resultado por tabla; las tablas no listadas devuelven vacío. */
function mockTables(tables: Record<string, Result>) {
  mockFrom.mockImplementation((table: string) => chain(tables[table] ?? { data: [] }));
}

const pool = (rows: Record<string, unknown>[], count = rows.length) => ({ data: rows, count });
const SESSION = { chat_sessions: { data: { id: 'sess-1' } } };

/** Sustituye a companyAuthMiddleware: valida el token y rellena req.locals. */
const fakeAuth: express.RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  const { data, error } = await mockGetUser(header.replace('Bearer ', ''));
  if (error || !data?.user) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  (req as unknown as { locals: unknown }).locals = {
    user: { id: 'user-1', email: 'rec@test.com' },
    companyId: 'company-1',
    profile: { role: 'recruiter' },
  };
  next();
};

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const { default: chatRouter } = await import('./chat');
  app.use('/api/chat', fakeAuth, chatRouter);
  return app;
};

const llmReply = (payload: unknown) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  });

const send = (app: express.Express, message: string) =>
  request(app)
    .post('/api/chat')
    .set('Authorization', 'Bearer token-valido')
    .send({ message, session_id: 'sess-1' });

describe('POST /api/chat', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockTables({ ...SESSION });
    app = await buildApp();
  });

  it('devuelve 401 sin Authorization header', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'hola' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No autorizado');
  });

  it('devuelve 401 con token inválido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-malo')
      .send({ message: 'hola' });
    expect(res.status).toBe(401);
  });

  it('devuelve 400 con mensaje vacío', async () => {
    const res = await send(app, '   ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Mensaje vacío');
  });

  it('devuelve 400 con mensaje demasiado largo', async () => {
    const res = await send(app, 'a'.repeat(1001));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/demasiado largo/);
  });

  it('responde 200 con mensaje válido usando fallback por palabras clave', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    mockTables({
      ...SESSION,
      candidates: pool([
        { id: 'c1', full_name: 'Ana García', position: 'Desarrolladora React', location: 'Bogotá', experience_years: 3, expected_salary: 4000000, source: 'internal', status: 'pending' },
      ]),
    });

    const res = await send(app, 'Busco desarrolladora React');

    expect(res.status).toBe(200);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.candidates).toHaveLength(1);
    expect(mockNoResults).not.toHaveBeenCalled();
  });

  it('no incluye email ni teléfono en la respuesta del chat', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    mockTables({
      ...SESSION,
      candidates: pool([
        { id: 'c1', full_name: 'Juan Pérez', position: 'Backend', email: 'juan@privado.com', phone: '3001234567', location: 'Medellín', experience_years: 5, source: 'internal', status: 'pending' },
      ]),
    });

    const res = await send(app, 'backend medellín');

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('juan@privado.com');
    expect(body).not.toContain('3001234567');
  });

  it('resultado vacío dispara no_search_results, agrega el aviso y omite candidate_shortage', async () => {
    global.fetch = llmReply({ message: 'No encontré a nadie.', results: [] });
    mockTables({ ...SESSION, candidates: pool([], 5) }); // 5 < 30: habría escasez

    const res = await send(app, 'ingeniero de datos');

    expect(res.status).toBe(200);
    expect(mockNoResults).toHaveBeenCalledTimes(1);
    expect(mockNoResults).toHaveBeenCalledWith('company-1', 'user-1', 'ingeniero de datos', 'sess-1');
    expect(res.body.message).toContain('No encontré a nadie.');
    expect(res.body.message).toContain('fuentes externas');
    expect(mockShortage).not.toHaveBeenCalled();
  });

  it('con resultados no dispara no_search_results', async () => {
    global.fetch = llmReply({ message: 'Encontré uno.', results: [{ id: 'c1', reason: 'React, 3 años' }] });
    mockTables({
      ...SESSION,
      candidates: pool([
        { id: 'c1', full_name: 'Ana García', position: 'React', source: 'internal', status: 'seguimiento' },
      ], 50), // 50 ≥ 30: sin escasez
    });

    const res = await send(app, 'react');

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.message).not.toContain('fuentes externas');
    expect(mockNoResults).not.toHaveBeenCalled();
    expect(mockShortage).not.toHaveBeenCalled();
  });

  it('con resultados y pocos candidatos en la empresa dispara candidate_shortage', async () => {
    global.fetch = llmReply({ message: 'Encontré uno.', results: [{ id: 'c1', reason: 'React' }] });
    mockTables({
      ...SESSION,
      candidates: pool([
        { id: 'c1', full_name: 'Ana García', position: 'React', source: 'internal', status: 'seguimiento' },
      ], 8),
    });

    await send(app, 'react');

    expect(mockShortage).toHaveBeenCalledTimes(1);
    expect(mockShortage.mock.calls[0][0]).toBe('company-1');
  });
});
