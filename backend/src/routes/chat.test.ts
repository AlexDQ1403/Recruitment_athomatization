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
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'not', 'in', 'insert', 'update']) {
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
  vi.resetModules();
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

  it('fallback: "contador" encuentra "Contadora Pública" (sin tildes y por raíz) y marca kind', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    mockTables({
      ...SESSION,
      candidates: pool([
        { id: 'c1', full_name: 'Laura Ríos', position: 'Contadora Pública', location: 'Cali', source: 'scraping', status: 'seguimiento' },
        { id: 'c2', full_name: 'Pedro Gil', position: 'Desarrollador Java', location: 'Cali', source: 'scraping', status: 'seguimiento' },
      ]),
    });

    const res = await send(app, 'Necesito un contador');

    expect(res.status).toBe(200);
    expect(res.body.candidates.map((c: { id: string }) => c.id)).toEqual(['c1']);
    expect(res.body.candidates[0].kind).toBe('legacy');
  });

  it('preselecciona en la base por los términos del mensaje (no 150 filas cualquiera)', async () => {
    global.fetch = llmReply({ message: 'ok', results: [] });
    const chains: Record<string, unknown>[] = [];
    mockFrom.mockImplementation((table: string) => {
      const c = chain(table === 'chat_sessions' ? SESSION.chat_sessions : { data: [] });
      if (table === 'candidates') chains.push(c);
      return c;
    });

    await send(app, 'Busco contador con experiencia en Bogotá');

    const orCalls = chains.flatMap((c) => (c.or as ReturnType<typeof vi.fn>).mock.calls.map((args) => args[0] as string));
    expect(orCalls).toHaveLength(1);
    expect(orCalls[0]).toContain('position.ilike.%contad%');
    expect(orCalls[0]).toContain('headline.ilike.%contad%');
    expect(orCalls[0]).not.toContain('experiencia');
  });

  it('afinidad: combina el puntaje de cargo del LLM con los criterios y ordena de mayor a menor', async () => {
    global.fetch = llmReply({
      message: 'ok',
      criteria: { location: 'Bogotá' },
      results: [
        { id: 'c1', reason: 'cargo relacionado', fit: 'partial', score: 40 },
        { id: 'c2', reason: 'mismo cargo', fit: 'full', score: 95 },
      ],
    });
    mockTables({
      ...SESSION,
      candidates: pool([
        { id: 'c1', full_name: 'Uno', position: 'Auxiliar administrativo', location: 'Bogotá', source: 'internal', status: 'seguimiento' },
        { id: 'c2', full_name: 'Dos', position: 'Contador', location: 'Bogotá', source: 'internal', status: 'seguimiento' },
      ]),
    });

    const res = await send(app, 'contador en Bogotá');

    expect(res.status).toBe(200);
    expect(res.body.candidates.map((c: { id: string }) => c.id)).toEqual(['c2', 'c1']);
    // (95·50 + 100·15) / 65 = 96 ; (40·50 + 100·15) / 65 = 54
    expect(res.body.candidates.map((c: { affinity: number }) => c.affinity)).toEqual([96, 54]);
    expect(res.body.candidates[0].affinity_parts.map((p: { factor: string }) => p.factor)).toEqual(['cargo', 'ubicacion']);
  });

  describe('rechazos', () => {
    const rows = [
      { id: 'c1', full_name: 'Laura', position: 'Contadora Pública', location: 'Bogotá', source: 'scraping', status: 'seguimiento' },
      { id: 'c2', full_name: 'Pedro', position: 'Contador', location: 'Bogotá', source: 'scraping', status: 'seguimiento' },
      { id: 'c3', full_name: 'Descartada', position: 'Contador', location: 'Bogotá', source: 'internal', status: 'rechazado' },
    ];
    // c1 fue rechazada como "contador público"
    const rejections = [{
      id: 'r1', legacy_candidate_id: 'c1', candidate_profile_id: null, role_label: 'Contador público',
      role_key: 'contad publi', vacancy_id: null, reason: 'Sin NIIF', created_at: '2026-11-10T00:00:00Z',
    }];

    const promptOf = (fetchMock: ReturnType<typeof vi.fn>) =>
      JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content as string;

    it('si el mensaje nombra el puesto rechazado, ni siquiera llega al LLM; el descartado global tampoco', async () => {
      const fetchMock = llmReply({ message: 'ok', cargo: 'contador público', results: [{ id: 'c2' }] });
      global.fetch = fetchMock;
      mockTables({ ...SESSION, candidates: pool(rows), candidate_rejections: { data: rejections } });

      const res = await send(app, 'Busco contador público');

      expect(res.body.candidates.map((c: { id: string }) => c.id)).toEqual(['c2']);
      expect(promptOf(fetchMock)).not.toContain('"c1"');
      expect(promptOf(fetchMock)).not.toContain('"c3"');
    });

    it('con el cargo que entendió el LLM se excluye aunque el mensaje lo dijera distinto', async () => {
      // "contador" (cargo del LLM) ≈ "contador público" (puesto rechazado)
      global.fetch = llmReply({ message: 'ok', cargo: 'contador', results: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] });
      mockTables({ ...SESSION, candidates: pool(rows), candidate_rejections: { data: rejections } });

      const res = await send(app, 'Busco contador en Bogotá');

      expect(res.body.candidates.map((c: { id: string }) => c.id)).toEqual(['c2']);
      expect(res.body.candidates[0].matched_role).toBe('contador');
    });

    it('para otro puesto sí aparece, con la nota de para qué se rechazó', async () => {
      global.fetch = llmReply({ message: 'ok', cargo: 'auditor', results: [{ id: 'c1' }] });
      mockTables({ ...SESSION, candidates: pool(rows), candidate_rejections: { data: rejections } });

      const res = await send(app, 'Busco auditor');

      expect(res.body.candidates.map((c: { id: string }) => c.id)).toEqual(['c1']);
      expect(res.body.candidates[0].rejected_for).toEqual([{ role: 'Contador público', reason: 'Sin NIIF' }]);
    });
  });

  it('registra en el historial toda búsqueda, aunque no encuentre nada en la base', async () => {
    global.fetch = llmReply({ message: 'No encontré a nadie.', busqueda: true, results: [] });
    const inserts: Record<string, unknown>[] = [];
    mockFrom.mockImplementation((table: string) => {
      const c = chain(table === 'chat_sessions' ? SESSION.chat_sessions : { data: [] });
      if (table === 'search_history') (c.insert as ReturnType<typeof vi.fn>).mockImplementation((p: Record<string, unknown>) => { inserts.push(p); return c; });
      return c;
    });

    await send(app, 'Busco auxiliar de enfermería en Medellín');

    expect(inserts).toEqual([expect.objectContaining({ query: 'Busco auxiliar de enfermería en Medellín', candidates_found: 0 })]);
  });

  it('seguimiento: el modelo recibe qué candidatos se mostraron y no se busca afuera', async () => {
    const fetchMock = llmReply({ message: 'De esos, solo Ana menciona Next.js.', busqueda: false, cargo: 'desarrollador frontend', results: [{ id: 'c1' }] });
    global.fetch = fetchMock;
    mockTables({
      ...SESSION,
      chat_messages: { data: [{ role: 'assistant', content: 'Encontré 2 perfiles.', candidates: [{ id: 'c1' }, { id: 'c2' }] }] },
      candidates: pool([
        { id: 'c1', full_name: 'Ana', position: 'Desarrolladora frontend', summary: 'React y Next.js', source: 'scraping', status: 'seguimiento' },
        { id: 'c2', full_name: 'Juan', position: 'Desarrollador frontend', summary: 'Angular', source: 'scraping', status: 'seguimiento' },
      ]),
    });

    const res = await send(app, 'De esos, ¿cuáles tienen Next.js?');

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).messages;
    expect(sent.some((m: { content: string }) => m.content.includes('[Candidatos mostrados: c1, c2]'))).toBe(true);
    // El extracto llega al modelo (ahí está "Next.js")
    expect(sent[0].content).toContain('React y Next.js');
    expect(res.body.candidates.map((c: { id: string }) => c.id)).toEqual(['c1']);
    expect(res.body.external_search).toBe(false);
    expect(mockSearchShortage).not.toHaveBeenCalled();
    expect(mockNoResults).not.toHaveBeenCalled();
  });

  it('REGRESIÓN: nulls del modelo en criterios o resultados no tumban la búsqueda inteligente', async () => {
    global.fetch = llmReply({
      message: 'Encontré a Ana.', busqueda: true, cargo: 'asesor comercial',
      criteria: { experience_min: null, salary_max: null, location: 'Cali' },
      results: [{ id: 'c1', reason: null, fit: null, score: null }],
    });
    mockTables({ ...SESSION, candidates: pool([{ id: 'c1', full_name: 'Ana', position: 'Asesora comercial', location: 'Cali', source: 'internal', status: 'seguimiento' }]) });

    const res = await send(app, 'Asesor comercial para venta de seguros en Cali');

    expect(res.body.message).toContain('Encontré a Ana.');
    expect(res.body.candidates[0]).toMatchObject({ id: 'c1', matched_role: 'asesor comercial' });
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
