import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

vi.mock('../config', () => ({
  config: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', NODE_ENV: 'test' as const, LOG_LEVEL: 'error' as const },
}));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../utils/tracing', () => ({
  correlationMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getCorrelationId: () => 'cid',
}));

type Row = Record<string, unknown>;
type Tables = 'vacancies' | 'applications' | 'candidate_profiles' | 'profiles' | 'candidates' | 'company_candidates' | 'candidate_contact_log' | 'candidate_rejections';
let db: Record<Tables, Row[]>;
let failTable: { table: Tables; error: { code: string; message: string } } | null = null;

type Filter = (r: Row) => boolean;

function builder(table: Tables) {
  const filters: Filter[] = [];
  let counting = false;
  let range: [number, number] | null = null;
  const b: Record<string, unknown> = {};

  const run = () => {
    if (failTable && failTable.table === table) return { data: null, error: failTable.error, count: null };
    const hit = db[table].filter((r) => filters.every((f) => f(r)));
    if (counting) return { data: null, error: null, count: hit.length };
    const sorted = [...hit].sort((a, c) => String(c.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    const page = range ? sorted.slice(range[0], range[1] + 1) : sorted;
    return { data: page.map((r) => ({ ...r })), error: null, count: null };
  };

  b.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => { counting = !!opts?.head; return b; };
  b.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; };
  b.neq = (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return b; };
  b.in = (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; };
  b.not = (k: string, _op: string, v: unknown) => { filters.push((r) => r[k] !== v && r[k] !== undefined); return b; };
  b.order = () => b;
  b.range = (a: number, z: number) => { range = [a, z]; return b; };
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => builder(t as Tables) }),
}));

const CO = 'co-1';
const OTHER = 'co-2';
const V1 = '11111111-1111-4111-8111-111111111111'; // activa
const V2 = '22222222-2222-4222-8222-222222222222'; // activa
const VX = '99999999-9999-4999-8999-999999999999'; // otra empresa

const buildApp = async (role = 'recruiter', companyId: string | null = CO) => {
  const app = express();
  app.use((req: express.Request & AuthenticatedRequest, _res, next) => {
    req.locals = { user: { id: 'u1', email: 'u@t.com' }, profile: { id: 'u1', role }, companyId: companyId ?? undefined } as AuthenticatedRequest['locals'];
    next();
  });
  const { default: router } = await import('./dashboard');
  app.use('/api/dashboard', router);
  return app;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe('GET /api/dashboard/recruiter', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failTable = null;
    db = {
      vacancies: [
        { id: V1, company_id: CO, title: 'Contador público', status: 'active', created_at: daysAgo(20), deadline: null },
        { id: V2, company_id: CO, title: 'Enfermera', status: 'active', created_at: daysAgo(10), deadline: null },
        { id: VX, company_id: OTHER, title: 'Ajena', status: 'active', created_at: daysAgo(10), deadline: null },
      ],
      candidates: [
        { id: 'l1', company_id: CO, full_name: 'Laura', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: V1, created_at: daysAgo(10), email: 'laura@privado.com', phone: '3001234567', expected_salary: 9 },
        { id: 'l2', company_id: CO, full_name: 'Pedro', position: 'Contador', source: 'internal', status: 'en_contacto', vacancy_id: V1, created_at: daysAgo(60) },
        { id: 'lx', company_id: OTHER, full_name: 'De otra empresa', position: 'X', source: 'scraping', status: 'seguimiento', vacancy_id: VX, created_at: daysAgo(1) },
      ],
      company_candidates: [
        { company_id: CO, legacy_candidate_id: 'l2', candidate_profile_id: null, status: 'en_contacto', source: 'internal', presented_to_company: true, presented_at: daysAgo(7), company_decision: 'pendiente', created_at: daysAgo(60) },
      ],
      applications: [
        { company_id: CO, candidate_profile_id: 'p1', vacancy_id: V2, status: 'enviada', created_at: daysAgo(2) },
      ],
      candidate_profiles: [{ id: 'p1', profile_id: 'acc-1', professional_title: 'Enfermera jefe', position: null }],
      profiles: [{ id: 'acc-1', full_name: 'Mario' }],
      candidate_contact_log: [
        { company_id: CO, legacy_candidate_id: 'l1', candidate_profile_id: null, created_at: daysAgo(4) },
        { company_id: OTHER, legacy_candidate_id: 'lx', candidate_profile_id: null, created_at: daysAgo(9) },
      ],
      candidate_rejections: [],
    };
    app = await buildApp();
  });

  const get = (query = '') => request(app).get(`/api/dashboard/recruiter${query}`);

  it('arma embudo, qué hacer hoy, vacantes y orígenes con los contactos reales', async () => {
    const res = await get('?period=all');
    expect(res.status).toBe(200);
    expect(res.body.funnel).toEqual({ candidates: 3, contacted: 2, approved: 1, hired: 0, rejected: 0 });
    expect(res.body.actions.follow_up.items.map((i: { id: string }) => i.id)).toEqual(['l1']);
    expect(res.body.actions.new_applicants.items).toEqual([expect.objectContaining({ kind: 'profile', id: 'p1', full_name: 'Mario', title: 'Enfermera jefe', vacancy_title: 'Enfermera' })]);
    expect(res.body.actions.awaiting_company.items.map((i: { id: string }) => i.id)).toEqual(['l2']);
    expect(res.body.vacancies.map((v: { id: string }) => v.id).sort()).toEqual([V1, V2].sort());
  });

  it('por defecto los últimos 30 días; filtros por vacante y origen', async () => {
    expect((await get()).body.filters).toEqual({ period: '30d' });
    expect((await get()).body.funnel.candidates).toBe(2); // Pedro es de hace 60 días
    expect((await get(`?period=all&vacancy_id=${V2}`)).body.funnel.candidates).toBe(1);
    expect((await get('?period=all&source=internal')).body.funnel.candidates).toBe(1);
  });

  it('400 con filtros inválidos', async () => {
    expect((await get('?period=1y')).status).toBe(400);
    expect((await get('?vacancy_id=no-uuid')).status).toBe(400);
    expect((await get('?source=linkedin')).status).toBe(400);
  });

  it('aislamiento: nunca mezcla datos de otra empresa; no expone datos sensibles', async () => {
    const res = await get('?period=all');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('De otra empresa');
    expect(body).not.toContain('Ajena');
    expect(body).not.toContain('laura@privado.com');
    expect(body).not.toContain('3001234567');
  });

  it('sin las tablas de contactos o rechazos (migraciones pendientes) se muestra igual', async () => {
    failTable = { table: 'candidate_contact_log', error: { code: 'PGRST205', message: 'no existe' } };
    const res = await get('?period=all');
    expect(res.status).toBe(200);
    expect(res.body.funnel.contacted).toBe(1); // solo por estado en_contacto
  });

  it('empresa sin datos → ceros y listas vacías', async () => {
    db = { vacancies: [], candidates: [], company_candidates: [], applications: [], candidate_profiles: [], profiles: [], candidate_contact_log: [], candidate_rejections: [] };
    const res = await get();
    expect(res.body.funnel).toEqual({ candidates: 0, contacted: 0, approved: 0, hired: 0, rejected: 0 });
    expect(res.body.actions.follow_up).toEqual({ total: 0, items: [] });
    expect(res.body.vacancies).toEqual([]);
    expect(res.body.sources).toEqual([]);
  });

  it('403 sin empresa; 500 genérico sin detalles; 503 si falta una migración', async () => {
    app = await buildApp('recruiter', null);
    expect((await get()).status).toBe(403);

    app = await buildApp();
    failTable = { table: 'candidates', error: { code: 'XX000', message: 'detalle interno' } };
    const err = await get();
    expect(err.status).toBe(500);
    expect(JSON.stringify(err.body)).not.toContain('detalle interno');

    failTable = { table: 'company_candidates', error: { code: '42703', message: 'column does not exist' } };
    expect((await get()).status).toBe(503);
  });
});
