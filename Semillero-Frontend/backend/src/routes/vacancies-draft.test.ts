import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../config', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', OPENROUTER_API_KEY: 'sk-or-test',
    NODE_ENV: 'test' as const, LOG_LEVEL: 'error' as const,
  },
}));
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../utils/tracing', () => ({ getCorrelationId: () => 'cid' }));

type Row = Record<string, unknown>;
let vacancies: Row[] = [];
const inserts: Row[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const filters: [string, unknown][] = [];
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (k: string, v: unknown) => { filters.push([k, v]); return b; };
      b.order = () => b;
      b.limit = () => b;
      b.insert = (p: Row) => { inserts.push(p); return b; };
      b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve({ data: vacancies.filter((r) => filters.every(([k, v]) => r[k] === v)), error: null }).then(ok, ko);
      return b;
    },
  }),
}));

const llmReply = (payload: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) });

const buildApp = async (role = 'recruiter') => {
  vi.resetModules(); // limitador de borradores nuevo en cada prueba
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { locals: unknown }).locals = { user: { id: 'u1' }, companyId: 'co-1', profile: { role } };
    next();
  });
  const { default: router } = await import('./vacancies');
  app.use('/api/vacancies', router);
  return app;
};

describe('borrador de vacante con IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vacancies = [];
    inserts.length = 0;
  });

  it('propone la vacante a partir del texto informal y NO la guarda', async () => {
    const fetchMock = llmReply({
      title: 'Contador(a) público(a)', description: 'Resumen...', location: 'Bogotá', modality: 'presencial',
      salary_max: 3000000, experience_years_min: 2, skills: ['NIIF', 'SIIGO'], notes: ['No indicaste beneficios'],
    });
    global.fetch = fetchMock;
    const app = await buildApp();

    const res = await request(app).post('/api/vacancies/draft').send({ text: 'necesito contadora en Bogotá, 2 años, hasta 3 millones' });

    expect(res.status).toBe(200);
    expect(res.body.draft).toMatchObject({ title: 'Contador(a) público(a)', location: 'Bogotá', salary_max: 3000000, experience_years_min: 2, skills: ['NIIF', 'SIIGO'] });
    expect(res.body.notes).toEqual(['No indicaste beneficios']);
    expect(inserts).toHaveLength(0);
    // El texto del reclutador va como mensaje de usuario, separado de las instrucciones
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages[1]).toEqual({ role: 'user', content: 'necesito contadora en Bogotá, 2 años, hasta 3 millones' });
  });

  it('si la IA falla responde 502 con un mensaje para llenar a mano', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('sin saldo'));
    const app = await buildApp();
    const res = await request(app).post('/api/vacancies/draft').send({ text: 'contadora en Bogotá' });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/llenar el formulario a mano/);
  });

  it('400 con texto muy corto; 403 para roles que no publican vacantes', async () => {
    const app = await buildApp();
    expect((await request(app).post('/api/vacancies/draft').send({ text: 'hi' })).status).toBe(400);
    const candidato = await buildApp('candidato');
    expect((await request(candidato).post('/api/vacancies/draft').send({ text: 'contadora en Bogotá' })).status).toBe(403);
  });
});

describe('GET /api/vacancies/match', () => {
  beforeEach(() => {
    vacancies = [
      { id: 'v1', title: 'Contador(a) público(a)', company_id: 'co-1', status: 'active' },
      { id: 'v2', title: 'Auxiliar administrativo', company_id: 'co-1', status: 'active' },
      { id: 'v3', title: 'Enfermera jefe', company_id: 'co-1', status: 'closed' },
      { id: 'v4', title: 'Contador', company_id: 'co-2', status: 'active' },
    ];
  });

  it('encuentra la vacante activa del mismo cargo de la empresa', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/vacancies/match').query({ role: 'contadora' });
    expect(res.body.vacancy).toEqual({ id: 'v1', title: 'Contador(a) público(a)', company_id: 'co-1', status: 'active' });
  });

  it('null si no hay del mismo cargo, si está cerrada o si es de otra empresa', async () => {
    const app = await buildApp();
    expect((await request(app).get('/api/vacancies/match').query({ role: 'auxiliar contable' })).body.vacancy).toBeNull();
    expect((await request(app).get('/api/vacancies/match').query({ role: 'enfermera' })).body.vacancy).toBeNull();
    expect((await request(app).get('/api/vacancies/match').query({ role: '' })).body.vacancy).toBeNull();
  });
});
