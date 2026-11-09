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
type Tables = 'vacancies' | 'applications' | 'candidate_profiles' | 'profiles' | 'candidates' | 'company_candidates' | 'candidate_status_history';
let db: Record<Tables, Row[]>;
let failOn: { table: Tables; op: string; error: { code: string; message: string } } | null = null;
let seq = 0;
let blindLookups = 0; // simula la carrera: las próximas N consultas a company_candidates salen vacías

const match = (r: Row, filters: [string, unknown][]) =>
  filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v));

function builder(table: Tables) {
  const filters: [string, unknown][] = [];
  let op: 'select' | 'update' | 'insert' = 'select';
  let payload: Row = {};
  const b: Record<string, unknown> = {};

  const run = () => {
    if (failOn && failOn.table === table && failOn.op === op) return { data: null, error: failOn.error };
    const rows = db[table];
    if (op === 'insert') {
      // Índice único parcial de company_candidates: duplicado → 23505 (como Postgres)
      if (table === 'company_candidates' && rows.some((r) =>
        r.company_id === payload.company_id &&
        ((payload.candidate_profile_id && r.candidate_profile_id === payload.candidate_profile_id) ||
          (payload.legacy_candidate_id && r.legacy_candidate_id === payload.legacy_candidate_id)))) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      rows.push({ id: `row-${++seq}`, ...payload });
      return { data: null, error: null };
    }
    if (op === 'select' && table === 'company_candidates' && blindLookups > 0) {
      blindLookups--;
      return { data: [], error: null };
    }
    const hit = rows.filter((r) => match(r, filters));
    if (op === 'update') {
      hit.forEach((r) => Object.assign(r, payload));
      return { data: null, error: null };
    }
    const sorted = [...hit].sort((a, c) => String(c.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    return { data: sorted.map((r) => ({ ...r })), error: null };
  };

  b.select = () => b;
  b.eq = (k: string, v: unknown) => { filters.push([k, v]); return b; };
  b.in = (k: string, v: unknown[]) => { filters.push([k, v]); return b; };
  b.order = () => b;
  b.range = () => b;
  b.update = (p: Row) => { op = 'update'; payload = p; return b; };
  b.insert = (p: Row) => { op = 'insert'; payload = p; return b; };
  b.maybeSingle = () => { const r = run(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }); };
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => builder(t as Tables) }),
}));

const CO = 'co-1';
const OTHER = 'co-2';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const VOTHER = '44444444-4444-4444-8444-444444444444';
const CP1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'; // con cuenta, vacante V1
const CP2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'; // con cuenta, solo vacante V2
const L1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'; // heredado, vacante V1
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'; // heredado, vacante V2
const LFOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9'; // de otra empresa

const buildApp = async (role = 'recruiter', companyId: string | null = CO) => {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & AuthenticatedRequest, _res, next) => {
    req.locals = { user: { id: 'user-1', email: 'u@test.com' }, profile: { id: 'user-1', role }, companyId: companyId ?? undefined } as AuthenticatedRequest['locals'];
    next();
  });
  const { default: router } = await import('./vacancy-applicants');
  app.use('/api/vacancies/:vacancyId/applicants', router);
  return app;
};

const url = (v: string, tail = '') => `/api/vacancies/${v}/applicants${tail}`;

describe('candidatos de una vacante', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    failOn = null;
    blindLookups = 0;
    db = {
      vacancies: [
        { id: V1, company_id: CO }, { id: V2, company_id: CO }, { id: VOTHER, company_id: OTHER },
      ],
      applications: [
        { id: 'app-1', vacancy_id: V1, company_id: CO, candidate_profile_id: CP1, status: 'enviada', created_at: '2026-03-02T00:00:00Z' },
        { id: 'app-2', vacancy_id: V2, company_id: CO, candidate_profile_id: CP2, status: 'enviada', created_at: '2026-03-03T00:00:00Z' },
      ],
      candidate_profiles: [
        { id: CP1, profile_id: 'acc-1', professional_title: 'Ingeniera de Datos Senior', position: 'Ingeniera de datos', location: 'Bogotá', experience_years: 4 },
        { id: CP2, profile_id: 'acc-2', professional_title: null, position: 'QA', location: null, experience_years: null },
      ],
      profiles: [{ id: 'acc-1', full_name: 'Ana Pérez' }, { id: 'acc-2', full_name: 'Luis Gómez' }],
      candidates: [
        { id: L1, company_id: CO, vacancy_id: V1, full_name: 'Carlos Ruiz', position: 'Desarrollador Python', location: 'Cali', experience_years: 2, status: 'seguimiento', source: 'internal', created_at: '2026-03-01T00:00:00Z', email: 'secreto@x.com', phone: '300', expected_salary: 9 },
        { id: L2, company_id: CO, vacancy_id: V2, full_name: 'Otra Vacante', position: 'X', status: 'seguimiento', created_at: '2026-03-01T00:00:00Z' },
        { id: LFOREIGN, company_id: OTHER, vacancy_id: V1, full_name: 'De otra empresa', position: 'X', status: 'seguimiento', created_at: '2026-03-01T00:00:00Z' },
      ],
      company_candidates: [
        { id: 'cc-l1', company_id: CO, legacy_candidate_id: L1, status: 'seguimiento', presented_to_company: true },
      ],
      candidate_status_history: [],
    };
    app = await buildApp();
  });

  describe('GET (la vista "Ver candidatos")', () => {
    it('lista solo los postulantes de ESA vacante: con cuenta y heredados, con nombre y título', async () => {
      const res = await request(app).get(url(V1));

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([
        { kind: 'profile', id: CP1, full_name: 'Ana Pérez', title: 'Ingeniera de Datos Senior', location: 'Bogotá', experience_years: 4, status: 'seguimiento', presented: false, company_decision: 'pendiente', applied_at: '2026-03-02T00:00:00Z' },
        { kind: 'legacy', id: L1, full_name: 'Carlos Ruiz', title: 'Desarrollador Python', location: 'Cali', experience_years: 2, status: 'seguimiento', presented: true, company_decision: 'pendiente', applied_at: '2026-03-01T00:00:00Z' },
      ]);
      expect(res.body.total).toBe(2);
    });

    it('el título es el encabezado profesional del perfil; si no lo tiene, usa el cargo (position)', async () => {
      expect((await request(app).get(url(V1))).body.items.find((i: { id: string }) => i.id === CP1).title).toBe('Ingeniera de Datos Senior');
      expect((await request(app).get(url(V2))).body.items.find((i: { id: string }) => i.id === CP2).title).toBe('QA');
    });

    it('no filtra datos sensibles (email, teléfono, salario)', async () => {
      const res = await request(app).get(url(V1));
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('secreto@x.com');
      for (const item of res.body.items) {
        expect(item).not.toHaveProperty('email');
        expect(item).not.toHaveProperty('phone');
        expect(item).not.toHaveProperty('expected_salary');
      }
    });

    it('nunca mezcla postulantes de otra empresa ni de otra vacante', async () => {
      const ids = (await request(app).get(url(V1))).body.items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(LFOREIGN);
      expect(ids).not.toContain(L2);
      expect(ids).not.toContain(CP2);
    });

    it('usa el estado de company_candidates para candidatos con cuenta', async () => {
      db.company_candidates.push({ id: 'cc-p1', company_id: CO, candidate_profile_id: CP1, status: 'en_contacto' });
      const res = await request(app).get(url(V1));
      expect(res.body.items.find((i: { id: string }) => i.id === CP1).status).toBe('en_contacto');
    });

    it('una vacante de otra empresa responde 404 (no revela que existe)', async () => {
      expect((await request(app).get(url(VOTHER))).status).toBe(404);
    });

    it('400 con un id que no es uuid, 403 sin empresa', async () => {
      expect((await request(app).get(url('no-uuid'))).status).toBe(400);
      app = await buildApp('recruiter', null);
      expect((await request(app).get(url(V1))).status).toBe(403);
    });

    it('vacante sin postulantes → lista vacía', async () => {
      db.vacancies.push({ id: '55555555-5555-4555-8555-555555555555', company_id: CO });
      const res = await request(app).get(url('55555555-5555-4555-8555-555555555555'));
      expect(res.body).toEqual({ items: [], total: 0 });
    });

    it('500 genérico (sin detalles) y 503 si falta una migración', async () => {
      failOn = { table: 'applications', op: 'select', error: { code: 'XX000', message: 'boom interno' } };
      const generic = await request(app).get(url(V1));
      expect(generic.status).toBe(500);
      expect(JSON.stringify(generic.body)).not.toContain('boom');

      failOn = { table: 'applications', op: 'select', error: { code: '42703', message: 'column' } };
      expect((await request(app).get(url(V1))).status).toBe(503);
    });
  });

  describe('PATCH estado — candidato heredado', () => {
    const patch = (id: string, status: string, v = V1) => request(app).patch(url(v, `/legacy/${id}/status`)).send({ status });

    it('pasa a en_contacto, deja historial y sincroniza company_candidates', async () => {
      const res = await patch(L1, 'en_contacto');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ kind: 'legacy', id: L1, status: 'en_contacto' });
      expect(db.candidates.find((c) => c.id === L1)?.status).toBe('en_contacto');
      expect(db.candidate_status_history).toEqual([
        expect.objectContaining({ candidate_id: L1, from_status: 'seguimiento', to_status: 'en_contacto', changed_by: 'user-1' }),
      ]);
      const cc = db.company_candidates.find((c) => c.legacy_candidate_id === L1);
      expect(cc?.status).toBe('en_contacto');
      expect(cc?.presented_to_company).toBe(true); // en contacto no la toca
    });

    it('rechazar lo saca de la lista de aceptados y es terminal (409)', async () => {
      expect((await patch(L1, 'rechazado')).status).toBe(200);
      expect(db.company_candidates.find((c) => c.legacy_candidate_id === L1)?.presented_to_company).toBe(false);

      const back = await patch(L1, 'seguimiento');
      expect(back.status).toBe(409);
      expect(db.candidates.find((c) => c.id === L1)?.status).toBe('rechazado');
    });

    it('repetir el mismo estado no duplica historial', async () => {
      const res = await patch(L1, 'seguimiento');
      expect(res.body.unchanged).toBe(true);
      expect(db.candidate_status_history).toHaveLength(0);
    });

    it('un candidato de otra empresa o de otra vacante da 404 y no se modifica', async () => {
      expect((await patch(LFOREIGN, 'rechazado')).status).toBe(404);
      expect((await patch(L2, 'rechazado')).status).toBe(404); // es de V2, no de V1
      expect(db.candidates.find((c) => c.id === LFOREIGN)?.status).toBe('seguimiento');
      expect(db.candidates.find((c) => c.id === L2)?.status).toBe('seguimiento');
    });

    it('si la vacante es de otra empresa: 404', async () => {
      expect((await patch(L1, 'rechazado', VOTHER)).status).toBe(404);
    });
  });

  describe('PATCH estado — candidato con cuenta', () => {
    const patch = (id: string, status: string, v = V1) => request(app).patch(url(v, `/profile/${id}/status`)).send({ status });

    it('REGRESIÓN: si no existe la fila company_candidates (el alta del portal la perdía), la crea sin upsert', async () => {
      expect(db.company_candidates.some((c) => c.candidate_profile_id === CP1)).toBe(false);

      const res = await patch(CP1, 'en_contacto');

      expect(res.status).toBe(200);
      expect(db.company_candidates.find((c) => c.candidate_profile_id === CP1)).toMatchObject({
        company_id: CO, status: 'en_contacto', source: 'applicant', created_by: 'user-1',
      });
    });

    it('actualiza la fila existente y sincroniza el estado que ve el candidato', async () => {
      db.company_candidates.push({ id: 'cc-p1', company_id: CO, candidate_profile_id: CP1, status: 'seguimiento', presented_to_company: true });

      await patch(CP1, 'en_contacto');
      expect(db.company_candidates.filter((c) => c.candidate_profile_id === CP1)).toHaveLength(1);
      expect(db.applications.find((a) => a.id === 'app-1')?.status).toBe('contactado');

      await patch(CP1, 'rechazado');
      expect(db.applications.find((a) => a.id === 'app-1')?.status).toBe('descartada');
      expect(db.company_candidates.find((c) => c.candidate_profile_id === CP1)?.presented_to_company).toBe(false);
    });

    it('rechazado es terminal (409)', async () => {
      db.company_candidates.push({ id: 'cc-p1', company_id: CO, candidate_profile_id: CP1, status: 'rechazado' });
      expect((await patch(CP1, 'seguimiento')).status).toBe(409);
    });

    it('si falla sincronizar la postulación, el cambio del reclutador se mantiene', async () => {
      failOn = { table: 'applications', op: 'update', error: { code: '23514', message: 'check' } };
      const res = await patch(CP1, 'en_contacto');
      expect(res.status).toBe(200);
      expect(db.company_candidates.find((c) => c.candidate_profile_id === CP1)?.status).toBe('en_contacto');
    });

    it('quien no se postuló a ESA vacante da 404 (CP2 solo está en V2)', async () => {
      expect((await patch(CP2, 'rechazado')).status).toBe(404);
      expect(db.company_candidates.some((c) => c.candidate_profile_id === CP2)).toBe(false);
    });

    it('carrera 23505: otra petición creó la fila entre la consulta y el insert → se actualiza, sin error', async () => {
      db.company_candidates.push({ id: 'cc-race', company_id: CO, candidate_profile_id: CP1, status: 'seguimiento' });
      blindLookups = 1; // la consulta previa no ve la fila; el insert sí choca con ella

      const res = await patch(CP1, 'en_contacto');

      expect(res.status).toBe(200);
      const rows = db.company_candidates.filter((c) => c.candidate_profile_id === CP1);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('en_contacto');
    });
  });

  describe('la empresa solo ve lo que un reclutador aprobó', () => {
    it('REQUISITO: el rol empresa recibe únicamente los candidatos aprobados', async () => {
      // L1 está aprobado (presented_to_company=true); CP1 no lo está
      app = await buildApp('empresa');
      const res = await request(app).get(url(V1));

      expect(res.status).toBe(200);
      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([L1]);
      expect(JSON.stringify(res.body)).not.toContain('Ana Pérez'); // sin aprobar: invisible
    });

    it('el reclutador sigue viendo a todos, con la marca de aprobado y la decisión de la empresa', async () => {
      db.company_candidates.find((c) => c.id === 'cc-l1')!.company_decision = 'contratado';
      const items = (await request(app).get(url(V1))).body.items;

      expect(items).toHaveLength(2);
      expect(items.find((i: { id: string }) => i.id === L1)).toMatchObject({ presented: true, company_decision: 'contratado' });
      expect(items.find((i: { id: string }) => i.id === CP1)).toMatchObject({ presented: false, company_decision: 'pendiente' });
    });

    it('una vez que el reclutador aprueba a Ana, la empresa la ve', async () => {
      expect((await request(app).post(url(V1, `/profile/${CP1}/approve`))).status).toBe(200);

      app = await buildApp('empresa');
      const ids = (await request(app).get(url(V1))).body.items.map((i: { id: string }) => i.id);
      expect(ids).toEqual(expect.arrayContaining([CP1, L1]));
    });
  });

  describe('POST aprobar (el reclutador presenta el candidato a la empresa)', () => {
    const approve = (kind: string, id: string, v = V1) => request(app).post(url(v, `/${kind}/${id}/approve`));

    it('candidato con cuenta sin fila: la crea ya presentada, sin upsert', async () => {
      const res = await approve('profile', CP1);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ kind: 'profile', id: CP1, presented: true });
      expect(db.company_candidates.find((c) => c.candidate_profile_id === CP1)).toMatchObject({
        company_id: CO, presented_to_company: true, presented_by: 'user-1', status: 'seguimiento', source: 'applicant',
      });
    });

    it('con fila existente: la actualiza (no duplica) y conserva el pipeline', async () => {
      db.company_candidates.push({ id: 'cc-p1', company_id: CO, candidate_profile_id: CP1, status: 'en_contacto', presented_to_company: false });

      await approve('profile', CP1);

      const rows = db.company_candidates.filter((c) => c.candidate_profile_id === CP1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ presented_to_company: true, status: 'en_contacto' });
    });

    it('ficha heredada sin fila: la crea con su origen y su estado', async () => {
      db.company_candidates = [];
      const res = await approve('legacy', L1);

      expect(res.status).toBe(200);
      expect(db.company_candidates.find((c) => c.legacy_candidate_id === L1)).toMatchObject({
        company_id: CO, presented_to_company: true, source: 'internal', status: 'seguimiento',
      });
    });

    it('aprobar dos veces es idempotente', async () => {
      await approve('profile', CP1);
      const again = await approve('profile', CP1);
      expect(again.body.unchanged).toBe(true);
      expect(db.company_candidates.filter((c) => c.candidate_profile_id === CP1)).toHaveLength(1);
    });

    it('un candidato rechazado no se puede aprobar (409)', async () => {
      db.candidates.find((c) => c.id === L1)!.status = 'rechazado';
      db.company_candidates = [];
      expect((await approve('legacy', L1)).status).toBe(409);
      expect(db.company_candidates).toHaveLength(0);
    });

    it('404 si no es de esa vacante o de otra empresa; nada se escribe', async () => {
      expect((await approve('legacy', L2)).status).toBe(404); // es de V2
      expect((await approve('legacy', LFOREIGN)).status).toBe(404);
      expect((await approve('profile', CP2)).status).toBe(404); // solo se postuló a V2
      expect((await approve('profile', CP1, VOTHER)).status).toBe(404);
      expect(db.company_candidates.some((c) => c.candidate_profile_id === CP2)).toBe(false);
    });

    it('400 con tipo o id inválidos; 500 genérico', async () => {
      expect((await approve('otro', L1)).status).toBe(400);
      expect((await approve('legacy', 'xx')).status).toBe(400);

      failOn = { table: 'company_candidates', op: 'insert', error: { code: 'XX000', message: 'boom interno' } };
      const res = await approve('profile', CP1);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('boom');
    });
  });

  describe('la empresa ya decidió: el reclutador no puede cambiar el proceso', () => {
    it('409 al cambiar el pipeline de un candidato contratado o descartado (heredado y con cuenta)', async () => {
      db.company_candidates.find((c) => c.id === 'cc-l1')!.company_decision = 'descartado';
      db.company_candidates.push({ id: 'cc-p1', company_id: CO, candidate_profile_id: CP1, status: 'seguimiento', presented_to_company: true, company_decision: 'contratado' });

      const legacy = await request(app).patch(url(V1, `/legacy/${L1}/status`)).send({ status: 'rechazado' });
      const profile = await request(app).patch(url(V1, `/profile/${CP1}/status`)).send({ status: 'rechazado' });

      expect(legacy.status).toBe(409);
      expect(profile.status).toBe(409);
      expect(db.candidates.find((c) => c.id === L1)?.status).toBe('seguimiento');
      expect(db.company_candidates.find((c) => c.id === 'cc-p1')).toMatchObject({ status: 'seguimiento', presented_to_company: true });
    });
  });

  describe('validación y permisos', () => {
    it('400 con estado inválido, tipo inválido o ids inválidos', async () => {
      expect((await request(app).patch(url(V1, `/legacy/${L1}/status`)).send({ status: 'contratado' })).status).toBe(400);
      expect((await request(app).patch(url(V1, `/legacy/${L1}/status`)).send({})).status).toBe(400);
      expect((await request(app).patch(url(V1, `/otro/${L1}/status`)).send({ status: 'seguimiento' })).status).toBe(400);
      expect((await request(app).patch(url(V1, `/legacy/xx/status`)).send({ status: 'seguimiento' })).status).toBe(400);
    });

    it('el rol empresa NO puede cambiar el pipeline ni aprobar (solo el reclutador): 403 y no se modifica', async () => {
      app = await buildApp('empresa');
      expect((await request(app).patch(url(V1, `/legacy/${L1}/status`)).send({ status: 'en_contacto' })).status).toBe(403);
      expect((await request(app).post(url(V1, `/profile/${CP1}/approve`))).status).toBe(403);
      expect(db.candidates.find((c) => c.id === L1)?.status).toBe('seguimiento');
      expect(db.company_candidates.some((c) => c.candidate_profile_id === CP1)).toBe(false);
    });

    it('500 genérico si falla la base al cambiar estado', async () => {
      failOn = { table: 'candidates', op: 'update', error: { code: 'XX000', message: 'boom interno' } };
      const res = await request(app).patch(url(V1, `/legacy/${L1}/status`)).send({ status: 'en_contacto' });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('boom');
    });
  });
});
