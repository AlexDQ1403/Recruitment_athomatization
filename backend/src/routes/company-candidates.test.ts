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
type Tables = 'company_candidates' | 'candidate_profiles' | 'candidates' | 'profiles' | 'applications' | 'vacancies' | 'candidate_status_history';
let db: Record<Tables, Row[]>;
let failOn: { table: Tables; op: string; error: { code: string; message: string } } | null = null;
let raceDecide: (() => void) | null = null; // simula otra petición que decide entre la consulta y la escritura

function builder(table: Tables) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'update' = 'select';
  let counting = false;
  let wantCount = false;
  let payload: Row = {};
  let range: [number, number] | null = null;
  const b: Record<string, unknown> = {};

  const run = () => {
    if (failOn && failOn.table === table && failOn.op === op) return { data: null, error: failOn.error, count: null };
    if (op === 'update' && raceDecide) { const f = raceDecide; raceDecide = null; f(); }
    const hit = db[table].filter((r) => filters.every((f) => f(r)));
    if (op === 'update') {
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit.map((r) => ({ ...r })), error: null, count: hit.length };
    }
    if (counting) return { data: null, error: null, count: hit.length };
    const sorted = [...hit].sort((a, c) => String(c.presented_at ?? c.changed_at ?? '').localeCompare(String(a.presented_at ?? a.changed_at ?? '')));
    const page = range ? sorted.slice(range[0], range[1] + 1) : sorted;
    return { data: page.map((r) => ({ ...r })), error: null, count: wantCount ? hit.length : null };
  };

  b.select = (_c?: string, opts?: { count?: string; head?: boolean }) => { counting = !!opts?.head; wantCount = !!opts?.count; return b; };
  b.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; };
  b.in = (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; };
  b.order = () => b;
  b.range = (a: number, z: number) => { range = [a, z]; return b; };
  b.update = (p: Row) => { op = 'update'; payload = p; return b; };
  b.maybeSingle = () => { const r = run(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }); };
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => builder(t as Tables) }),
}));

const CO = 'co-1';
const OTHER = 'co-2';
const L1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'; // heredado, aprobado, pendiente
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'; // heredado, NO aprobado
const CP1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'; // con cuenta, aprobado, pendiente
const LFOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9'; // aprobado pero de otra empresa

const buildApp = async (role = 'empresa', companyId: string | null = CO) => {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & AuthenticatedRequest, _res, next) => {
    req.locals = { user: { id: 'emp-1', email: 'e@t.com' }, profile: { id: 'emp-1', role }, companyId: companyId ?? undefined } as AuthenticatedRequest['locals'];
    next();
  });
  const { default: router } = await import('./company-candidates');
  app.use('/api/company/candidates', router);
  return app;
};

const patch = (app: express.Express, kind: string, id: string, body: unknown) =>
  request(app).patch(`/api/company/candidates/${kind}/${id}/decision`).send(body as object);

describe('bandeja de la empresa', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failOn = null;
    raceDecide = null;
    db = {
      company_candidates: [
        { id: 'cc1', company_id: CO, legacy_candidate_id: L1, status: 'en_contacto', presented_to_company: true, presented_at: '2026-03-02T00:00:00Z', presented_by: 'rec-1', company_decision: 'pendiente' },
        { id: 'cc2', company_id: CO, legacy_candidate_id: L2, status: 'seguimiento', presented_to_company: false, company_decision: 'pendiente' },
        { id: 'cc3', company_id: CO, candidate_profile_id: CP1, status: 'seguimiento', presented_to_company: true, presented_at: '2026-03-03T00:00:00Z', presented_by: 'rec-1', company_decision: 'contratado', company_decided_at: '2026-03-04T00:00:00Z' },
        { id: 'cc4', company_id: OTHER, legacy_candidate_id: LFOREIGN, status: 'seguimiento', presented_to_company: true, presented_at: '2026-03-01T00:00:00Z', company_decision: 'pendiente' },
      ],
      candidates: [
        { id: L1, company_id: CO, full_name: 'Carlos Ruiz', position: 'Dev', location: 'Cali', experience_years: 2, status: 'en_contacto', vacancy_id: null },
        { id: L2, company_id: CO, full_name: 'No Aprobado', position: 'X', status: 'seguimiento' },
        { id: LFOREIGN, company_id: OTHER, full_name: 'De otra empresa', position: 'X', status: 'seguimiento' },
      ],
      candidate_profiles: [{ id: CP1, profile_id: 'acc-1', position: 'Datos', location: 'Bogotá', experience_years: 4 }],
      profiles: [{ id: 'rec-1', full_name: 'Rita Reclutadora' }, { id: 'acc-1', full_name: 'Ana Pérez' }],
      applications: [],
      vacancies: [],
      candidate_status_history: [],
    };
    app = await buildApp();
  });

  describe('GET /api/company/candidates', () => {
    it('403 si el usuario no tiene empresa asociada', async () => {
      expect((await request(await buildApp('empresa', null)).get('/api/company/candidates')).status).toBe(403);
    });

    it('si falta la migración 024, avisa con 503 en vez de un 500 genérico', async () => {
      failOn = { table: 'company_candidates', op: 'select', error: { code: '42703', message: 'column company_decision does not exist' } };
      const res = await request(app).get('/api/company/candidates');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('actualización pendiente');
    });

    it('lista vacía con resumen en cero cuando no hay candidatos presentados', async () => {
      const res = await request(await buildApp('empresa', 'co-vacia')).get('/api/company/candidates');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ candidates: [], total: 0, limit: 50, offset: 0, summary: { pendiente: 0, contratado: 0, descartado: 0 } });
    });

    it('SOLO devuelve candidatos aprobados por un reclutador, de su empresa', async () => {
      const res = await request(app).get('/api/company/candidates');

      const names = res.body.candidates.map((c: { candidate: { full_name: string } }) => c.candidate.full_name);
      expect(names).toContain('Carlos Ruiz');
      expect(names).not.toContain('No Aprobado'); // sin aprobar
      expect(names).not.toContain('De otra empresa'); // de otra empresa
      expect(res.body.total).toBe(2);
    });

    it('cada fila trae el tipo, el id y la decisión de la empresa', async () => {
      const res = await request(app).get('/api/company/candidates');
      const byId = (id: string) => res.body.candidates.find((c: { candidate: { id: string } }) => c.candidate.id === id);

      expect(byId(L1)).toMatchObject({ kind: 'legacy', decision: 'pendiente', decided_at: null, recruiter: { full_name: 'Rita Reclutadora' } });
      expect(byId(CP1)).toMatchObject({ kind: 'profile', decision: 'contratado', decided_at: '2026-03-04T00:00:00Z' });
    });

    it('el resumen cuenta toda la bandeja por decisión, sin mezclar otras empresas', async () => {
      const res = await request(app).get('/api/company/candidates?limit=1');
      expect(res.body.candidates).toHaveLength(1);
      expect(res.body.summary).toEqual({ pendiente: 1, contratado: 1, descartado: 0 });
    });
  });

  describe('PATCH /api/company/candidates/:kind/:id/decision', () => {
    it('contratar: guarda la decisión, quién y cuándo', async () => {
      const res = await patch(app, 'legacy', L1, { decision: 'contratar' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ kind: 'legacy', id: L1, decision: 'contratado' });
      expect(db.company_candidates.find((c) => c.id === 'cc1')).toMatchObject({ company_decision: 'contratado', company_decided_by: 'emp-1' });
      expect(typeof db.company_candidates.find((c) => c.id === 'cc1')?.company_decided_at).toBe('string');
    });

    it('descartar: no toca el pipeline del reclutador ni la aprobación', async () => {
      await patch(app, 'legacy', L1, { decision: 'descartar' });

      const row = db.company_candidates.find((c) => c.id === 'cc1')!;
      expect(row.company_decision).toBe('descartado');
      expect(row.status).toBe('en_contacto'); // independiente del pipeline
      expect(row.presented_to_company).toBe(true);
    });

    it('un candidato NO aprobado da 404 y no se modifica (la empresa no puede decidir sobre él)', async () => {
      const res = await patch(app, 'legacy', L2, { decision: 'contratar' });
      expect(res.status).toBe(404);
      expect(db.company_candidates.find((c) => c.id === 'cc2')?.company_decision).toBe('pendiente');
    });

    it('un candidato de otra empresa da 404', async () => {
      const res = await patch(app, 'legacy', LFOREIGN, { decision: 'contratar' });
      expect(res.status).toBe(404);
      expect(db.company_candidates.find((c) => c.id === 'cc4')?.company_decision).toBe('pendiente');
    });

    it('la decisión es definitiva: cambiar a otra da 409; repetir la misma es idempotente', async () => {
      const changed = await patch(app, 'profile', CP1, { decision: 'descartar' }); // ya estaba contratado
      expect(changed.status).toBe(409);
      expect(db.company_candidates.find((c) => c.id === 'cc3')?.company_decision).toBe('contratado');

      const same = await patch(app, 'profile', CP1, { decision: 'contratar' });
      expect(same.status).toBe(200);
      expect(same.body.unchanged).toBe(true);
    });

    it('carrera: si otra petición decidió entre la consulta y la escritura, no la pisa (409)', async () => {
      raceDecide = () => { db.company_candidates.find((c) => c.id === 'cc1')!.company_decision = 'descartado'; };

      const res = await patch(app, 'legacy', L1, { decision: 'contratar' });

      expect(res.status).toBe(409);
      expect(db.company_candidates.find((c) => c.id === 'cc1')?.company_decision).toBe('descartado');
    });

    it('400 con decisión, tipo o id inválidos', async () => {
      expect((await patch(app, 'legacy', L1, { decision: 'aprobar' })).status).toBe(400);
      expect((await patch(app, 'legacy', L1, {})).status).toBe(400);
      expect((await patch(app, 'otro', L1, { decision: 'contratar' })).status).toBe(400);
      expect((await patch(app, 'legacy', 'no-uuid', { decision: 'contratar' })).status).toBe(400);
    });

    it('403 sin empresa; 500 genérico; 503 si falta la migración 024', async () => {
      expect((await patch(await buildApp('empresa', null), 'legacy', L1, { decision: 'contratar' })).status).toBe(403);

      failOn = { table: 'company_candidates', op: 'update', error: { code: 'XX000', message: 'boom interno' } };
      const generic = await patch(app, 'legacy', L1, { decision: 'contratar' });
      expect(generic.status).toBe(500);
      expect(JSON.stringify(generic.body)).not.toContain('boom');

      failOn = { table: 'company_candidates', op: 'select', error: { code: '42703', message: 'column company_decision does not exist' } };
      expect((await patch(app, 'legacy', L1, { decision: 'contratar' })).status).toBe(503);
    });
  });
});
