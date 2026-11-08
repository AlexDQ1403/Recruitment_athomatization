import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const cfg: Record<string, unknown> = {};
vi.mock('../config', () => ({ config: cfg }));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../utils/tracing', () => ({
  correlationMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getCorrelationId: () => 'test-correlation-id',
}));

// Estado de la "base de datos" falsa
let sessionExists = true;
let candidateRows: Record<string, unknown>[] = [];
let candidatesError: unknown = null;
let messageInsertError: unknown = null;
const filtersByTable: Record<string, Record<string, unknown>> = {};
const messageInserts: Record<string, unknown>[] = [];
const sessionUpdates: Record<string, unknown>[] = [];

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  filtersByTable[table] = filters;
  let op: 'select' | 'insert' | 'update' = 'select';
  const b: Record<string, unknown> = {};
  const resolve = () => {
    if (table === 'chat_messages' && op === 'insert') return { data: null, error: messageInsertError };
    if (table === 'chat_sessions' && op === 'update') return { data: null, error: null };
    if (table === 'candidates') return { data: candidateRows, error: candidatesError };
    return { data: null, error: null };
  };
  b.select = () => b;
  b.eq = (k: string, v: unknown) => { filters[k] = v; return b; };
  b.in = (k: string, v: unknown) => { filters[k] = v; return b; };
  b.insert = (p: Record<string, unknown>) => { op = 'insert'; if (table === 'chat_messages') messageInserts.push(p); return b; };
  b.update = (p: Record<string, unknown>) => { op = 'update'; if (table === 'chat_sessions') sessionUpdates.push(p); return b; };
  b.maybeSingle = () =>
    Promise.resolve({ data: table === 'chat_sessions' && sessionExists ? { id: 'sess' } : null, error: null });
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}));

const COMPANY = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const SESSION = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CAND = ['b1b1b1b1-1111-4111-8111-111111111111', 'b2b2b2b2-2222-4222-8222-222222222222'];
const SECRET = 'inbound-secret';

const body = (over: Record<string, unknown> = {}) => ({
  company_id: COMPANY,
  session_id: SESSION,
  candidate_ids: CAND,
  ...over,
});

const scraped = (id: string, over: Record<string, unknown> = {}) => ({
  id, full_name: `Dev ${id.slice(0, 2)}`, position: 'Desarrollador PHP', source: 'scraping', status: 'seguimiento',
  experience_years: null, expected_salary: null, location: null, profile_url: null, resume_url: null,
  // columnas sensibles que NUNCA deben salir (el endpoint ni siquiera las pide, pero se verifica la salida)
  email: 'x@privado.com', phone: '3000000000', linkedin_url: 'https://www.linkedin.com/in/x',
  ...over,
});

describe('POST /api/n8n-webhook/search-complete', () => {
  let app: express.Express;
  const post = (payload: unknown, secret: string | null = SECRET) => {
    const r = request(app).post('/api/n8n-webhook/search-complete');
    if (secret !== null) r.set('X-N8N-Secret', secret);
    return r.send(payload as object);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    cfg.SUPABASE_URL = 'https://test.supabase.co';
    cfg.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    cfg.N8N_WEBHOOK_SECRET = SECRET;
    sessionExists = true;
    candidateRows = CAND.map((id) => scraped(id));
    candidatesError = null;
    messageInsertError = null;
    messageInserts.length = 0;
    sessionUpdates.length = 0;
    for (const k of Object.keys(filtersByTable)) delete filtersByTable[k];

    app = express();
    app.use(express.json());
    const { n8nSecret } = await import('../middlewares/n8nSecret');
    const { default: router } = await import('./n8n-webhook');
    app.use('/api/n8n-webhook', n8nSecret, router);
  });

  it('401 sin el secreto de n8n, sin tocar la base de datos', async () => {
    const res = await post(body(), null);
    expect(res.status).toBe(401);
    expect(messageInserts).toHaveLength(0);
  });

  it('400 con ids que no son uuid, más de 10 ids o sin sesión', async () => {
    expect((await post(body({ candidate_ids: ['no-uuid'] }))).status).toBe(400);
    expect((await post(body({ candidate_ids: Array(11).fill(CAND[0]) }))).status).toBe(400);
    expect((await post(body({ session_id: undefined }))).status).toBe(400);
    expect(messageInserts).toHaveLength(0);
  });

  it('404 si la sesión no pertenece a la empresa; no escribe nada', async () => {
    sessionExists = false;
    const res = await post(body());
    expect(res.status).toBe(404);
    expect(messageInserts).toHaveLength(0);
    // la sesión se busca por id Y empresa (no se puede escribir en la sesión de otra empresa)
    expect(filtersByTable.chat_sessions).toMatchObject({ id: SESSION, company_id: COMPANY });
  });

  it('agrega a la sesión un mensaje con los candidatos, filtrados por empresa', async () => {
    const res = await post(body());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, found: 2 });
    expect(filtersByTable.candidates).toMatchObject({ company_id: COMPANY, id: CAND });
    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0]).toMatchObject({ session_id: SESSION, role: 'assistant' });
    expect(messageInserts[0].content).toContain('2 perfiles');
    const saved = messageInserts[0].candidates as { id: string; observations: { code: string }[]; fit: string }[];
    expect(saved.map((c) => c.id)).toEqual(CAND);
    expect(saved[0].observations).toEqual([{ code: 'unverified_profile', severity: 'info' }]);
    expect(saved[0].fit).toBe('partial');
    expect(sessionUpdates).toHaveLength(1);
  });

  it('nunca expone email, teléfono ni la URL de LinkedIn guardada', async () => {
    await post(body());
    const stored = JSON.stringify(messageInserts[0]);
    expect(stored).not.toContain('x@privado.com');
    expect(stored).not.toContain('3000000000');
    expect(stored).not.toContain('linkedin.com/in/x');
  });

  it('con un solo perfil usa el singular', async () => {
    candidateRows = [scraped(CAND[0])];
    const res = await post(body({ candidate_ids: [CAND[0]] }));
    expect(res.body.found).toBe(1);
    expect(messageInserts[0].content).toContain('1 perfil ');
  });

  it('sin candidatos avisa que no hubo perfiles nuevos y guarda candidates en null', async () => {
    candidateRows = [];
    const res = await post(body({ candidate_ids: [] }));
    expect(res.body).toEqual({ success: true, found: 0 });
    expect(messageInserts[0].candidates).toBeNull();
    expect(messageInserts[0].content).toContain('no encontré perfiles nuevos');
  });

  it('un id de otra empresa no aparece: la consulta solo devuelve filas de company_id', async () => {
    candidateRows = []; // la base no devuelve filas de otra empresa
    const res = await post(body());
    expect(res.body.found).toBe(0);
    expect(filtersByTable.candidates.company_id).toBe(COMPANY);
  });

  it('500 genérico si falla la base de datos, sin filtrar detalles', async () => {
    candidatesError = { message: 'detalle interno' };
    const res = await post(body());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error al procesar el aviso de n8n' });
    expect(messageInserts).toHaveLength(0);
  });
});
