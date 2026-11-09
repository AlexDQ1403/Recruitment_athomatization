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
type Tables = 'vacancies' | 'applications' | 'candidate_profiles' | 'profiles' | 'candidates' | 'company_candidates';
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
const V1 = 'v-1'; // activa
const V2 = 'v-2'; // activa
const V3 = 'v-3'; // pausada
const VX = 'v-x'; // otra empresa

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

describe('GET /api/dashboard/recruiter', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failTable = null;
    db = {
      vacancies: [
        { id: V1, company_id: CO, title: 'Python', status: 'active' },
        { id: V2, company_id: CO, title: 'QA', status: 'active' },
        { id: V3, company_id: CO, title: 'Antigua', status: 'paused' },
        { id: VX, company_id: OTHER, title: 'Ajena', status: 'active' },
      ],
      candidates: [
        { id: 'l1', company_id: CO, full_name: 'Carlos', position: 'Dev', location: 'Cali', status: 'seguimiento', vacancy_id: V1, created_at: '2026-03-01T00:00:00Z', email: 'secreto@x.com' },
        { id: 'l2', company_id: CO, full_name: 'Dora', position: 'Dev', status: 'rechazado', vacancy_id: null, created_at: '2026-02-01T00:00:00Z' },
        { id: 'l3', company_id: OTHER, full_name: 'Ajeno', position: 'X', status: 'seguimiento', vacancy_id: VX, created_at: '2026-04-01T00:00:00Z' },
      ],
      candidate_profiles: [
        { id: 'cp1', profile_id: 'acc1', professional_title: 'Ingeniera de Datos', position: 'datos', location: 'Bogotá' },
        { id: 'cp2', profile_id: 'acc2', professional_title: null, position: 'QA Senior', location: null },
      ],
      profiles: [{ id: 'acc1', full_name: 'Ana Pérez' }, { id: 'acc2', full_name: 'Luis Gómez' }],
      applications: [
        { company_id: CO, vacancy_id: V1, candidate_profile_id: 'cp1', created_at: '2026-03-05T00:00:00Z' },
        { company_id: CO, vacancy_id: V2, candidate_profile_id: 'cp2', created_at: '2026-03-04T00:00:00Z' },
        { company_id: OTHER, vacancy_id: VX, candidate_profile_id: 'cp1', created_at: '2026-04-05T00:00:00Z' },
      ],
      company_candidates: [
        // Ana con cuenta: en contacto y aprobada para la empresa. Luis (cp2) NO tiene fila.
        { id: 'cc1', company_id: CO, candidate_profile_id: 'cp1', status: 'en_contacto', presented_to_company: true },
        { id: 'cc2', company_id: CO, legacy_candidate_id: 'l2', status: 'rechazado', presented_to_company: true },
        { id: 'cc3', company_id: OTHER, candidate_profile_id: 'cp1', status: 'seguimiento', presented_to_company: true },
      ],
    };
    app = await buildApp();
  });

  it('cuenta fichas heredadas Y candidatos con cuenta en el pipeline (antes solo veía las heredadas)', async () => {
    const res = await request(app).get('/api/dashboard/recruiter');

    expect(res.status).toBe(200);
    // seguimiento: Carlos (heredado) + Luis (con cuenta, sin fila en company_candidates)
    // en_contacto: Ana · rechazado: Dora
    expect(res.body.pipeline).toEqual({ seguimiento: 2, en_contacto: 1, rechazado: 1 });
    expect(res.body.total).toBe(4);
  });

  it('REGRESIÓN: el postulante sin fila en company_candidates cuenta como seguimiento', async () => {
    db.company_candidates = db.company_candidates.filter((c) => c.candidate_profile_id !== 'cp1' || c.company_id !== CO);
    const res = await request(app).get('/api/dashboard/recruiter');
    expect(res.body.pipeline).toEqual({ seguimiento: 3, en_contacto: 0, rechazado: 1 });
  });

  it('"aprobados" son los presentados a la empresa que no están rechazados (no hay "contratados")', async () => {
    const res = await request(app).get('/api/dashboard/recruiter');
    expect(res.body.approved).toBe(1); // Ana; Dora está rechazada; la fila de otra empresa no cuenta
  });

  it('"contratados" son los que la empresa contrató, solo de su empresa y solo si fueron presentados', async () => {
    db.company_candidates.push(
      { id: 'h1', company_id: CO, candidate_profile_id: 'cp1', status: 'seguimiento', presented_to_company: true, company_decision: 'contratado' },
      { id: 'h2', company_id: CO, legacy_candidate_id: 'l1', status: 'seguimiento', presented_to_company: true, company_decision: 'descartado' },
      { id: 'h3', company_id: OTHER, legacy_candidate_id: 'l3', status: 'seguimiento', presented_to_company: true, company_decision: 'contratado' },
      { id: 'h4', company_id: CO, legacy_candidate_id: 'l9', status: 'seguimiento', presented_to_company: false, company_decision: 'contratado' },
    );
    expect((await request(app).get('/api/dashboard/recruiter')).body.hired).toBe(1);
  });

  it('resume las vacantes: por estado, aplicantes de las activas y las más pedidas', async () => {
    const res = await request(app).get('/api/dashboard/recruiter');
    expect(res.body.vacancies).toEqual({
      active: 2, paused: 1, closed: 0,
      applicants_active: 3, // Python: Ana + Carlos; QA: Luis
      top: [{ id: V1, title: 'Python', applicants: 2 }, { id: V2, title: 'QA', applicants: 1 }],
    });
  });

  it('los aplicantes de vacantes pausadas o cerradas no cuentan en "aplicantes de activas"', async () => {
    db.applications.push({ company_id: CO, vacancy_id: V3, candidate_profile_id: 'cp2', created_at: '2026-02-01T00:00:00Z' });
    db.candidates.push({ id: 'l9', company_id: CO, full_name: 'Pausado', position: 'X', status: 'seguimiento', vacancy_id: V3, created_at: '2026-01-01T00:00:00Z' });

    const { vacancies } = (await request(app).get('/api/dashboard/recruiter')).body;

    expect(vacancies.applicants_active).toBe(3);
    expect(vacancies.top.map((v: { id: string }) => v.id)).not.toContain(V3);
  });

  it('actividad reciente: mezcla heredados y postulaciones, más nueva primero, con título y vacante', async () => {
    const res = await request(app).get('/api/dashboard/recruiter');
    expect(res.body.recent.map((r: { full_name: string }) => r.full_name)).toEqual(['Ana Pérez', 'Luis Gómez', 'Carlos', 'Dora']);
    expect(res.body.recent[0]).toMatchObject({ kind: 'profile', title: 'Ingeniera de Datos', status: 'en_contacto', vacancy_title: 'Python' });
    expect(res.body.recent[1]).toMatchObject({ title: 'QA Senior', status: 'seguimiento', vacancy_title: 'QA' });
    expect(res.body.recent[2]).toMatchObject({ kind: 'legacy', vacancy_title: 'Python' });
  });

  it('aislamiento: nunca mezcla datos de otra empresa', async () => {
    const mine = JSON.stringify((await request(app).get('/api/dashboard/recruiter')).body);
    expect(mine).not.toContain('Ajeno');
    expect(mine).not.toContain('Ajena');

    app = await buildApp('recruiter', OTHER);
    const other = (await request(app).get('/api/dashboard/recruiter')).body;
    expect(other.vacancies.top.map((v: { title: string }) => v.title)).toEqual(['Ajena']);
    expect(other.recent.map((r: { full_name: string }) => r.full_name)).toEqual(['Ana Pérez', 'Ajeno']);
  });

  it('no expone datos sensibles (email, teléfono, salario)', async () => {
    const text = JSON.stringify((await request(app).get('/api/dashboard/recruiter')).body);
    expect(text).not.toContain('secreto@x.com');
  });

  it('empresa sin datos → ceros y listas vacías', async () => {
    app = await buildApp('recruiter', 'co-vacia');
    const res = await request(app).get('/api/dashboard/recruiter');
    expect(res.body).toEqual({
      pipeline: { seguimiento: 0, en_contacto: 0, rechazado: 0 }, total: 0, approved: 0, hired: 0,
      vacancies: { active: 0, paused: 0, closed: 0, applicants_active: 0, top: [] }, recent: [],
    });
  });

  it('403 sin empresa; 500 genérico sin detalles; 503 si falta una migración', async () => {
    expect((await request(await buildApp('recruiter', null)).get('/api/dashboard/recruiter')).status).toBe(403);

    failTable = { table: 'vacancies', error: { code: 'XX000', message: 'boom interno' } };
    const generic = await request(app).get('/api/dashboard/recruiter');
    expect(generic.status).toBe(500);
    expect(JSON.stringify(generic.body)).not.toContain('boom');

    failTable = { table: 'vacancies', error: { code: '42703', message: 'column' } };
    expect((await request(app).get('/api/dashboard/recruiter')).status).toBe(503);
  });
});
