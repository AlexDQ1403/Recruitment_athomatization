import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

vi.mock('../config', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../utils/tracing', () => ({
  correlationMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getCorrelationId: () => 'test-correlation-id',
}));

type Row = Record<string, unknown>;
let db: { vacancies: Row[]; applications: Row[]; candidates: Row[] };
let failTable: { table: string; error: { code: string; message: string } } | null = null;
let lastVacancySelect = '';

const match = (r: Row, filters: [string, unknown][]) =>
  filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v));

function builder(table: keyof typeof db) {
  const filters: [string, unknown][] = [];
  let op: 'select' | 'update' | 'delete' = 'select';
  let payload: Row = {};
  let rangeTo: [number, number] | null = null;
  const b: Record<string, unknown> = {};

  const run = () => {
    if (failTable && failTable.table === table) return { data: null, error: failTable.error, count: null };
    const rows = db[table];
    const hit = rows.filter((r) => match(r, filters));
    if (op === 'update') {
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit.map((r) => ({ ...r })), error: null, count: hit.length };
    }
    if (op === 'delete') {
      db[table] = rows.filter((r) => !hit.includes(r));
      return { data: hit.map((r) => ({ id: r.id })), error: null, count: hit.length };
    }
    const sorted = [...hit].sort((a, c) => String(c.created_at).localeCompare(String(a.created_at)));
    const page = rangeTo ? sorted.slice(rangeTo[0], rangeTo[1] + 1) : sorted;
    return { data: page.map((r) => ({ ...r })), error: null, count: hit.length };
  };

  b.select = (cols?: string) => { if (table === 'vacancies' && op === 'select' && cols) lastVacancySelect = cols; return b; };
  b.eq = (k: string, v: unknown) => { filters.push([k, v]); return b; };
  b.in = (k: string, v: unknown[]) => { filters.push([k, v]); return b; };
  b.order = () => b;
  b.range = (a: number, z: number) => { rangeTo = [a, z]; return b; };
  b.update = (p: Row) => { op = 'update'; payload = p; return b; };
  b.delete = () => { op = 'delete'; return b; };
  b.maybeSingle = () => {
    const r = run();
    return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
  };
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => builder(t as keyof typeof db) }),
}));

const CO = 'co-1';
const OTHER = 'co-2';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V3 = '33333333-3333-4333-8333-333333333333';
const FOREIGN = '44444444-4444-4444-8444-444444444444';

const vacancy = (id: string, over: Row = {}): Row => ({
  id, company_id: CO, company: 'Acme', title: `Cargo ${id.slice(0, 2)}`, description: 'desc', location: 'Bogotá',
  modality: 'remoto', salary_min: 1, salary_max: 2, experience_years_min: 0, skills: ['React'],
  status: 'active', created_by: 'user-1', deadline: '2026-12-31', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const buildApp = async (role: string, companyId: string | undefined = CO) => {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & AuthenticatedRequest, _res, next) => {
    req.locals = { user: { id: 'user-1', email: 'u@test.com' }, profile: { id: 'user-1', role }, companyId } as AuthenticatedRequest['locals'];
    next();
  });
  const { default: router } = await import('./vacancies');
  app.use('/api/vacancies', router);
  return app;
};

describe('gestión de vacantes de la empresa', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failTable = null;
    lastVacancySelect = '';
    db = {
      vacancies: [
        vacancy(V1, { created_at: '2026-03-01T00:00:00Z' }),
        vacancy(V2, { created_at: '2026-02-01T00:00:00Z', status: 'paused' }),
        vacancy(V3, { created_at: '2026-01-01T00:00:00Z', status: 'closed' }),
        vacancy(FOREIGN, { company_id: OTHER, company: 'Otra', created_at: '2026-04-01T00:00:00Z' }),
      ],
      applications: [
        { vacancy_id: V1, company_id: CO },
        { vacancy_id: V1, company_id: CO },
        { vacancy_id: V1, company_id: OTHER }, // de otra empresa: no cuenta
      ],
      candidates: [{ vacancy_id: V1, company_id: CO }],
    };
    app = await buildApp('recruiter');
  });

  describe('GET /api/vacancies (la lista de la pestaña)', () => {
    it('REGRESIÓN lista vacía: devuelve las vacantes de la empresa del token, sin depender de políticas RLS', async () => {
      const res = await request(app).get('/api/vacancies');

      expect(res.status).toBe(200);
      expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([V1, V2, V3]); // más nueva primero
      expect(res.body.total).toBe(3);
    });

    it('nunca mezcla vacantes de otra empresa', async () => {
      const res = await request(app).get('/api/vacancies');
      expect(res.body.items.map((v: { id: string }) => v.id)).not.toContain(FOREIGN);

      app = await buildApp('empresa', OTHER);
      const other = await request(app).get('/api/vacancies');
      expect(other.body.items.map((v: { id: string }) => v.id)).toEqual([FOREIGN]);
    });

    it('filtra por estado', async () => {
      const res = await request(app).get('/api/vacancies?status=active');
      expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([V1]);
      expect((await request(app).get('/api/vacancies?status=paused')).body.items).toHaveLength(1);
    });

    it('400 con un estado desconocido', async () => {
      expect((await request(app).get('/api/vacancies?status=borrador')).status).toBe(400);
    });

    it('pagina y devuelve el total', async () => {
      const res = await request(app).get('/api/vacancies?limit=2&page=2');
      expect(res.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([V3]);
    });

    it('applicants_count suma postulaciones y candidatos heredados, solo de su empresa', async () => {
      const res = await request(app).get('/api/vacancies?status=active');
      expect(res.body.items[0].applicants_count).toBe(3); // 2 postulaciones + 1 heredado; la de otra empresa no
      const empty = await request(app).get('/api/vacancies?status=paused');
      expect(empty.body.items[0].applicants_count).toBe(0);
    });

    it('no expone company_id', async () => {
      const res = await request(app).get('/api/vacancies');
      expect(lastVacancySelect).not.toContain('company_id');
      expect(res.body.items[0]).toHaveProperty('title');
    });

    it('403 para un candidato y para quien no tiene empresa', async () => {
      expect((await request(await buildApp('candidato')).get('/api/vacancies')).status).toBe(403);
      expect((await request(await buildApp('superAdmin', undefined)).get('/api/vacancies')).status).toBe(403);
    });

    it('503 con aviso útil si la base está desfasada; 500 genérico en otros errores', async () => {
      failTable = { table: 'vacancies', error: { code: '42703', message: 'column vacancies.skills does not exist' } };
      const drift = await request(app).get('/api/vacancies');
      expect(drift.status).toBe(503);
      expect(JSON.stringify(drift.body)).not.toContain('skills');

      failTable = { table: 'vacancies', error: { code: 'XX000', message: 'boom' } };
      const other = await request(app).get('/api/vacancies');
      expect(other.status).toBe(500);
      expect(other.body).toEqual({ error: 'Error interno' });
    });
  });

  describe('PATCH /api/vacancies/:id (editar, pausar, activar)', () => {
    it('pausar y reactivar cambian solo el estado', async () => {
      const paused = await request(app).patch(`/api/vacancies/${V1}`).send({ status: 'paused' });
      expect(paused.status).toBe(200);
      expect(db.vacancies[0]).toMatchObject({ status: 'paused', title: 'Cargo 11' });

      const active = await request(app).patch(`/api/vacancies/${V1}`).send({ status: 'active' });
      expect(active.body.status).toBe('active');
    });

    it('una vacante de otra empresa da 404 y no se modifica', async () => {
      const res = await request(app).patch(`/api/vacancies/${FOREIGN}`).send({ status: 'closed', title: 'Hackeada' });
      expect(res.status).toBe(404);
      expect(db.vacancies.find((v) => v.id === FOREIGN)).toMatchObject({ status: 'active', title: `Cargo ${FOREIGN.slice(0, 2)}` });
    });

    it('no permite cambiar la empresa, el autor ni el id aunque el cliente los envíe', async () => {
      await request(app).patch(`/api/vacancies/${V1}`).send({
        title: 'Nuevo cargo', company_id: OTHER, company: 'Falsa', created_by: 'otro', id: V2,
      });
      expect(db.vacancies[0]).toMatchObject({ id: V1, title: 'Nuevo cargo', company_id: CO, company: 'Acme', created_by: 'user-1' });
    });

    it('"" borra descripción, ubicación y fecha límite (null); lo que no llega no se toca', async () => {
      const res = await request(app).patch(`/api/vacancies/${V1}`).send({ description: '', location: '', deadline: '' });
      expect(res.status).toBe(200);
      expect(db.vacancies[0]).toMatchObject({ description: null, location: null, deadline: null, title: 'Cargo 11', modality: 'remoto' });
    });

    it('400 con cuerpo vacío, estado inválido, salario incoherente o id que no es uuid', async () => {
      expect((await request(app).patch(`/api/vacancies/${V1}`).send({})).status).toBe(400);
      expect((await request(app).patch(`/api/vacancies/${V1}`).send({ status: 'borrador' })).status).toBe(400);
      expect((await request(app).patch(`/api/vacancies/${V1}`).send({ salary_min: 9, salary_max: 1 })).status).toBe(400);
      expect((await request(app).patch('/api/vacancies/no-uuid').send({ status: 'paused' })).status).toBe(400);
    });

    it('403 para un candidato', async () => {
      expect((await request(await buildApp('candidato')).patch(`/api/vacancies/${V1}`).send({ status: 'paused' })).status).toBe(403);
      expect(db.vacancies[0].status).toBe('active');
    });
  });

  describe('DELETE /api/vacancies/:id', () => {
    it('la empresa elimina una vacante propia', async () => {
      app = await buildApp('empresa');
      const res = await request(app).delete(`/api/vacancies/${V3}`);
      expect(res.status).toBe(200);
      expect(db.vacancies.map((v) => v.id)).not.toContain(V3);
    });

    it('un reclutador no elimina (solo el rol empresa)', async () => {
      const res = await request(app).delete(`/api/vacancies/${V3}`);
      expect(res.status).toBe(403);
      expect(db.vacancies.map((v) => v.id)).toContain(V3);
    });

    it('una vacante de otra empresa da 404 y sigue existiendo', async () => {
      app = await buildApp('empresa');
      const res = await request(app).delete(`/api/vacancies/${FOREIGN}`);
      expect(res.status).toBe(404);
      expect(db.vacancies.map((v) => v.id)).toContain(FOREIGN);
    });

    it('400 con un id que no es uuid', async () => {
      app = await buildApp('empresa');
      expect((await request(app).delete('/api/vacancies/no-uuid')).status).toBe(400);
    });
  });
});
