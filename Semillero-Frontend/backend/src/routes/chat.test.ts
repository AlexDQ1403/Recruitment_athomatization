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

// true = la petición salió hacia n8n (false = repetida dentro de la ventana de 10 min)
const mockNoResults = vi.fn().mockResolvedValue(true);
const mockSearchShortage = vi.fn().mockResolvedValue(true);
const mockShortage = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/n8nService', () => ({
  triggerNoSearchResults: (...args: unknown[]) => mockNoResults(...args),
  triggerSearchShortage: (...args: unknown[]) => mockSearchShortage(...args),
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
    expect(mockSearchShortage).toHaveBeenCalledTimes(1); // 1 < 10: n8n completa la búsqueda
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

  const internalDevs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i}`, full_name: `Dev ${i}`, position: 'React', source: 'internal', status: 'seguimiento',
      experience_years: 3, expected_salary: 4000000, location: 'Bogotá',
    }));

  it('con 10 resultados no activa n8n y external_search es false', async () => {
    global.fetch = llmReply({
      message: 'Encontré 10.',
      results: internalDevs(10).map((c) => ({ id: c.id, reason: 'React', fit: 'full' })),
    });
    mockTables({ ...SESSION, candidates: pool(internalDevs(10), 50) }); // 50 ≥ 30: sin escasez

    const res = await send(app, 'react');

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(10);
    expect(res.body.external_search).toBe(false);
    expect(res.body.message).not.toContain('fuentes externas');
    expect(mockNoResults).not.toHaveBeenCalled();
    expect(mockSearchShortage).not.toHaveBeenCalled();
    expect(mockShortage).not.toHaveBeenCalled();
  });

  it('con menos de 10 resultados devuelve los encontrados Y activa n8n con la consulta', async () => {
    global.fetch = llmReply({ message: 'Encontré uno.', results: [{ id: 'c0', reason: 'React, 3 años' }] });
    mockTables({ ...SESSION, candidates: pool(internalDevs(1), 50) });

    const res = await send(app, 'react');

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.external_search).toBe(true);
    expect(res.body.message).toContain('Encontré uno.');
    expect(res.body.message).toContain('el único perfil');
    expect(res.body.message).toContain('fuentes externas');
    expect(mockSearchShortage).toHaveBeenCalledWith('company-1', 'user-1', 'react', 'sess-1', 1);
    expect(mockNoResults).not.toHaveBeenCalled();
    // el aviso genérico de escasez no se suma al de la búsqueda
    expect(mockShortage).not.toHaveBeenCalled();
  });

  it('si n8n ya buscó esta consulta hace poco no promete resultados nuevos', async () => {
    global.fetch = llmReply({ message: 'Encontré uno.', results: [{ id: 'c0' }] });
    mockSearchShortage.mockResolvedValueOnce(false);
    mockTables({ ...SESSION, candidates: pool(internalDevs(1), 50) });

    const res = await send(app, 'react');

    expect(res.body.external_search).toBe(false);
    expect(res.body.message).toContain('hace poco');
    expect(res.body.candidates).toHaveLength(1);
  });

  it('una pregunta general (busqueda:false) no activa n8n', async () => {
    global.fetch = llmReply({ message: 'Hola, ¿qué perfil buscas?', busqueda: false, results: [] });
    mockTables({ ...SESSION, candidates: pool(internalDevs(3), 50) });

    const res = await send(app, 'hola');

    expect(res.status).toBe(200);
    expect(res.body.external_search).toBe(false);
    expect(mockNoResults).not.toHaveBeenCalled();
    expect(mockSearchShortage).not.toHaveBeenCalled();
  });

  describe('observaciones', () => {
    const scraped = (id: string, extra: Record<string, unknown> = {}) => ({
      id, full_name: `Dev ${id}`, position: 'Desarrollador Java', source: 'scraping', status: 'seguimiento',
      experience_years: null, expected_salary: null, location: null, email: 'x@privado.com', phone: '3000000000', ...extra,
    });

    it('sin experiencia + experience_min → experience_missing y unverified_profile', async () => {
      global.fetch = llmReply({
        message: 'Java', criteria: { experience_min: 3 },
        results: [{ id: 'c1', reason: 'Java', fit: 'partial' }],
      });
      mockTables({ ...SESSION, candidates: pool([scraped('c1')], 50) });

      const res = await send(app, 'desarrollador Java con 3 años');
      const codes = res.body.candidates[0].observations.map((o: { code: string }) => o.code);

      expect(res.status).toBe(200);
      expect(codes).toEqual(['experience_missing', 'unverified_profile']);
      expect(res.body.candidates[0].fit).toBe('partial');
      expect(JSON.stringify(res.body)).not.toContain('x@privado.com');
      expect(JSON.stringify(res.body)).not.toContain('3000000000');
    });

    it('1 año vs 3 pedidos → experience_below y va después de quien cumple', async () => {
      global.fetch = llmReply({
        message: 'ok', criteria: { experience_min: 3 },
        results: [{ id: 'bajo', fit: 'partial' }, { id: 'ok', fit: 'full' }],
      });
      mockTables({
        ...SESSION,
        candidates: pool([
          scraped('bajo', { source: 'internal', experience_years: 1 }),
          scraped('ok', { source: 'internal', experience_years: 5 }),
        ], 50),
      });

      const res = await send(app, 'java 3 años');

      expect(res.body.candidates.map((c: { id: string }) => c.id)).toEqual(['ok', 'bajo']);
      expect(res.body.candidates[1].observations[0]).toMatchObject({ code: 'experience_below', found: 1, requested: 3 });
    });

    it('sin criterios solo aparece unverified_profile', async () => {
      global.fetch = llmReply({ message: 'ok', results: [{ id: 'c1', fit: 'full' }] });
      mockTables({ ...SESSION, candidates: pool([scraped('c1')], 50) });

      const res = await send(app, 'desarrollador java');

      expect(res.body.candidates[0].observations).toEqual([{ code: 'unverified_profile', severity: 'info' }]);
    });

    it('resultados parciales (<10) → activa n8n con la consulta original, no el aviso genérico', async () => {
      global.fetch = llmReply({
        message: 'ok', criteria: { experience_min: 3 }, results: [{ id: 'c1', fit: 'partial' }],
      });
      mockTables({ ...SESSION, candidates: pool([scraped('c1')], 50) });

      const res = await send(app, 'java 3 años');

      expect(mockSearchShortage).toHaveBeenCalledWith('company-1', 'user-1', 'java 3 años', 'sess-1', 1);
      expect(mockShortage).not.toHaveBeenCalled();
      expect(mockNoResults).not.toHaveBeenCalled();
      expect(res.body.external_search).toBe(true);
    });

    it('criteria inválido del LLM → fallback por palabras clave sin romper el contrato', async () => {
      global.fetch = llmReply({
        message: 'ok', criteria: { experience_min: 999 }, results: [{ id: 'c1' }],
      });
      mockTables({ ...SESSION, candidates: pool([scraped('c1')], 50) });

      const res = await send(app, 'desarrollador java');

      expect(res.status).toBe(200);
      expect(res.body.candidates).toHaveLength(1);
      expect(Array.isArray(res.body.candidates[0].observations)).toBe(true);
    });
  });

  it('con 10 resultados pero pocos candidatos en la empresa dispara candidate_shortage', async () => {
    global.fetch = llmReply({
      message: 'Encontré 10.',
      results: internalDevs(10).map((c) => ({ id: c.id, reason: 'React', fit: 'full' })),
    });
    mockTables({ ...SESSION, candidates: pool(internalDevs(10), 8) }); // 8 < 30

    await send(app, 'react');

    expect(mockShortage).toHaveBeenCalledTimes(1);
    expect(mockShortage.mock.calls[0][0]).toBe('company-1');
    expect(mockSearchShortage).not.toHaveBeenCalled();
  });
});
