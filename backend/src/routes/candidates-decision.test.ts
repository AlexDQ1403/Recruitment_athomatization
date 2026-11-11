import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { logger } from '../utils/logger';

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

vi.mock('../services/n8nService', () => ({
  triggerInterviewRequest: vi.fn().mockResolvedValue(true),
}));

type Row = Record<string, unknown>;

// "Base de datos" falsa con estado: permite comprobar los efectos reales de cada decisión.
let candidates: Row[] = [];
let bridge: Row[] = [];
let history: Row[] = [];
let vacancies: Row[] = [];
let failTable: string | null = null;
let raceOnInsert = false;
const upsertCalls: string[] = [];

const match = (row: Row, filters: [string, unknown][]) =>
  filters.every(([k, v]) => (Array.isArray(v) ? v.includes(row[k]) : row[k] === v));

function builder(table: string) {
  const filters: [string, unknown][] = [];
  let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
  let payload: Row = {};
  const rowsOf = () => (table === 'candidates' ? candidates : table === 'company_candidates' ? bridge : table === 'vacancies' ? vacancies : history);

  const run = (): { data: Row[] | null; error: { message: string; code?: string } | null } => {
    if (failTable === table && op !== 'select') return { data: null, error: { message: 'boom' } };
    const rows = rowsOf();
    if (op === 'update') {
      const hit = rows.filter((r) => match(r, filters));
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    if (op === 'insert') {
      // Índice único parcial uq_company_candidate_legacy (migración 015): un duplicado es 23505
      if (table === 'company_candidates' && raceOnInsert) {
        raceOnInsert = false;
        rows.push({ ...payload, presented_to_company: false }); // la creó la otra petición
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }
      if (table === 'company_candidates' && rows.some((r) => r.company_id === payload.company_id && r.legacy_candidate_id === payload.legacy_candidate_id)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }
      rows.push({ ...payload });
      return { data: [payload], error: null };
    }
    if (op === 'upsert') {
      upsertCalls.push(table);
      return { data: null, error: { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } };
    }
    return { data: rows.filter((r) => match(r, filters)), error: null };
  };

  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = (k: string, v: unknown) => { filters.push([k, v]); return b; };
  b.in = (k: string, v: unknown[]) => { filters.push([k, v]); return b; };
  b.update = (p: Row) => { op = 'update'; payload = p; return b; };
  b.insert = (p: Row) => { op = 'insert'; payload = p; return b; };
  b.upsert = (p: Row) => { op = 'upsert'; payload = p; return b; };
  b.single = () => {
    const r = run();
    return Promise.resolve(r.data && r.data[0] ? { data: r.data[0], error: null } : { data: null, error: { message: 'not found' } });
  };
  b.maybeSingle = () => {
    const r = run();
    return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
  };
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}));

const CO = 'co-1';
const OTHER_CO = 'co-2';
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';

const VAC = '44444444-4444-4444-8444-444444444444';
const VAC2 = '55555555-5555-4555-8555-555555555555';

// Por defecto el candidato ya está en una vacante: aprobar/seguimiento lo exigen
const candidate = (id: string, over: Row = {}): Row => ({
  id, company_id: CO, full_name: 'Ana', position: 'Dev', status: 'seguimiento', source: 'scraping', vacancy_id: VAC,
  email: 'ana@privado.com', phone: '3000000000', ...over,
});

const buildApp = async (role = 'recruiter') => {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & AuthenticatedRequest, _res, next) => {
    req.locals = { companyId: CO, user: { id: 'rec-1' }, profile: { role } } as AuthenticatedRequest['locals'];
    next();
  });
  const { default: router } = await import('./candidates');
  app.use('/api/candidates', router);
  return app;
};

const presentedRow = (id: string, over: Row = {}): Row => ({
  company_id: CO, legacy_candidate_id: id, presented_to_company: true, status: 'seguimiento', ...over,
});

describe('decisiones del reclutador sobre un candidato', () => {
  let app: express.Express;
  const decide = (id: string, body: unknown) => request(app).patch(`/api/candidates/${id}/decision`).send(body as object);

  beforeEach(async () => {
    vi.clearAllMocks();
    candidates = [candidate(C1), candidate(FOREIGN, { company_id: OTHER_CO })];
    bridge = [];
    history = [];
    vacancies = [
      { id: VAC, company_id: CO, title: 'Contador', status: 'active' },
      { id: VAC2, company_id: CO, title: 'Auxiliar', status: 'active' },
    ];
    failTable = null;
    raceOnInsert = false;
    upsertCalls.length = 0;
    app = await buildApp();
  });

  describe('autorización y validación', () => {
    it('403 si no es reclutador (la empresa ve su lista, no decide); no escribe nada', async () => {
      app = await buildApp('empresa');
      const res = await decide(C1, { decision: 'aprobar' });
      expect(res.status).toBe(403);
      expect(bridge).toHaveLength(0);
      expect(history).toHaveLength(0);
    });

    it('404 con un candidato de otra empresa; no lo modifica', async () => {
      const res = await decide(FOREIGN, { decision: 'rechazar' });
      expect(res.status).toBe(404);
      expect(candidates.find((c) => c.id === FOREIGN)!.status).toBe('seguimiento');
      expect(history).toHaveLength(0);
    });

    it('400 con decisión desconocida, cuerpo vacío o id que no es uuid', async () => {
      expect((await decide(C1, { decision: 'contratar' })).status).toBe(400);
      expect((await decide(C1, {})).status).toBe(400);
      expect((await decide('no-uuid', { decision: 'aprobar' })).status).toBe(400);
      expect((await decide(C1, { decision: 'aprobar', reason: 'x'.repeat(501) })).status).toBe(400);
      expect(history).toHaveLength(0);
    });
  });

  describe('aprobar', () => {
    it('entra en la lista de la empresa registrando quién y cuándo; el estado no cambia', async () => {
      const res = await decide(C1, { decision: 'aprobar' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: C1, status: 'seguimiento', presented: true, vacancy_id: VAC });
      expect(bridge).toHaveLength(1);
      expect(bridge[0]).toMatchObject({
        company_id: CO, legacy_candidate_id: C1, presented_to_company: true, presented_by: 'rec-1',
      });
      expect(bridge[0].presented_at).toBeTruthy();
      expect(history).toHaveLength(0); // sin cambio de estado no hay fila de historial
    });

    it('REGRESIÓN 500: no usa upsert sobre company_candidates (el índice único es parcial y la base lo rechaza)', async () => {
      const res = await decide(C1, { decision: 'aprobar' });
      expect(res.status).toBe(200);
      expect(upsertCalls).toEqual([]);
    });

    it('si la relación ya existía (rellenada por la migración 015) la actualiza sin crear otra', async () => {
      bridge = [{ company_id: CO, legacy_candidate_id: C1, presented_to_company: false, status: 'seguimiento' }];
      const res = await decide(C1, { decision: 'aprobar' });

      expect(res.status).toBe(200);
      expect(bridge).toHaveLength(1);
      expect(bridge[0]).toMatchObject({ presented_to_company: true, presented_by: 'rec-1' });
    });

    it('carrera: otra petición crea la relación entre la consulta y el insert (23505) → se actualiza', async () => {
      raceOnInsert = true;
      const res = await decide(C1, { decision: 'aprobar' });

      expect(res.status).toBe(200);
      expect(bridge).toHaveLength(1);
      expect(bridge[0]).toMatchObject({ presented_to_company: true, presented_by: 'rec-1' });
    });

    it('aprobar no cambia el estado del pipeline: un candidato en contacto sigue en contacto', async () => {
      candidates = [candidate(C1, { status: 'en_contacto' })];
      const res = await decide(C1, { decision: 'aprobar' });

      expect(res.body).toEqual({ id: C1, status: 'en_contacto', presented: true, vacancy_id: VAC });
      expect(candidates[0].status).toBe('en_contacto');
      expect(history).toHaveLength(0);
    });

    it('repetir la aprobación es idempotente: no duplica historial ni reescribe la fecha', async () => {
      await decide(C1, { decision: 'aprobar' });
      const firstDate = bridge[0].presented_at;
      const res = await decide(C1, { decision: 'aprobar' });

      expect(res.status).toBe(200);
      expect(res.body.unchanged).toBe(true);
      expect(bridge).toHaveLength(1);
      expect(bridge[0].presented_at).toBe(firstDate);
      expect(history).toHaveLength(0);
    });
  });

  describe('seguimiento (considerar sin descartar)', () => {
    it('un candidato aprobado sale de la lista de aceptados y sigue vivo en el pipeline', async () => {
      bridge = [presentedRow(C1)];
      const res = await decide(C1, { decision: 'seguimiento' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: C1, status: 'seguimiento', presented: false, vacancy_id: VAC });
      expect(candidates[0].status).toBe('seguimiento');
      expect(bridge[0]).toMatchObject({ presented_to_company: false, status: 'seguimiento' });
      expect(history).toHaveLength(0); // el estado ya era seguimiento: no hay cambio que registrar
    });

    it('desde en_contacto vuelve a seguimiento, queda en el historial y sale de la lista', async () => {
      candidates = [candidate(C1, { status: 'en_contacto' })];
      bridge = [presentedRow(C1, { status: 'en_contacto' })];
      const res = await decide(C1, { decision: 'seguimiento', reason: 'Esperar al cierre de presupuesto' });

      expect(res.body).toEqual({ id: C1, status: 'seguimiento', presented: false, vacancy_id: VAC });
      expect(bridge[0]).toMatchObject({ presented_to_company: false, status: 'seguimiento' });
      expect(history).toEqual([
        { candidate_id: C1, from_status: 'en_contacto', to_status: 'seguimiento', changed_by: 'rec-1', reason: 'Esperar al cierre de presupuesto' },
      ]);
    });

    it('sin fila en la lista de la empresa también funciona', async () => {
      candidates = [candidate(C1, { status: 'en_contacto' })];
      const res = await decide(C1, { decision: 'seguimiento' });
      expect(res.status).toBe(200);
      expect(candidates[0].status).toBe('seguimiento');
      expect(bridge).toHaveLength(0);
    });

    it('si ya está en seguimiento y sin aprobar no hace nada (idempotente)', async () => {
      const res = await decide(C1, { decision: 'seguimiento' });
      expect(res.body.unchanged).toBe(true);
      expect(history).toHaveLength(0);
      expect(candidates[0].status).toBe('seguimiento');
    });

    it('no existe un estado stand_by: la decisión se rechaza con 400', async () => {
      const res = await decide(C1, { decision: 'stand_by' });
      expect(res.status).toBe(400);
      expect(candidates[0].status).toBe('seguimiento');
    });
  });

  describe('vacante obligatoria para aprobar o dar seguimiento', () => {
    it('sin vacante (ni enviada ni asignada) responde 409 y no cambia nada', async () => {
      candidates = [candidate(C1, { vacancy_id: null })];
      for (const decision of ['aprobar', 'seguimiento']) {
        const res = await decide(C1, { decision });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('vacancy_required');
      }
      expect(bridge).toHaveLength(0);
      expect(history).toHaveLength(0);
    });

    it('con la vacante del cargo: la asigna y aprueba', async () => {
      candidates = [candidate(C1, { vacancy_id: null })];
      const res = await decide(C1, { decision: 'aprobar', vacancy_id: VAC2 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ presented: true, vacancy_id: VAC2 });
      expect(candidates[0].vacancy_id).toBe(VAC2);
      expect(bridge[0]).toMatchObject({ legacy_candidate_id: C1, presented_to_company: true });
    });

    it('no lo mueve en silencio de otra vacante; vacante ajena o cerrada da 404', async () => {
      const other = await decide(C1, { decision: 'seguimiento', vacancy_id: VAC2 });
      expect(other.status).toBe(409);
      expect(other.body.code).toBe('other_vacancy');
      expect(candidates[0].vacancy_id).toBe(VAC);

      vacancies.push({ id: '66666666-6666-4666-8666-666666666666', company_id: OTHER_CO, title: 'Ajena', status: 'active' });
      expect((await decide(C1, { decision: 'aprobar', vacancy_id: '66666666-6666-4666-8666-666666666666' })).status).toBe(404);
      vacancies[0].status = 'closed';
      expect((await decide(C1, { decision: 'aprobar', vacancy_id: VAC })).status).toBe(404);
    });

    it('rechazar no exige vacante', async () => {
      candidates = [candidate(C1, { vacancy_id: null })];
      expect((await decide(C1, { decision: 'rechazar' })).status).toBe(200);
    });
  });

  describe('rechazar', () => {
    it('rechaza, registra el motivo y lo saca de la lista de aceptados', async () => {
      bridge = [presentedRow(C1)];
      const res = await decide(C1, { decision: 'rechazar', reason: 'No cumple experiencia' });

      expect(res.body).toEqual({ id: C1, status: 'rechazado', presented: false, vacancy_id: VAC });
      expect(candidates[0].status).toBe('rechazado');
      expect(bridge[0]).toMatchObject({ presented_to_company: false, status: 'rechazado' });
      expect(history[0]).toMatchObject({ from_status: 'seguimiento', to_status: 'rechazado', changed_by: 'rec-1', reason: 'No cumple experiencia' });
    });

    it('se puede rechazar desde en_contacto', async () => {
      candidates = [candidate(C1, { status: 'en_contacto' })];
      const res = await decide(C1, { decision: 'rechazar' });
      expect(res.body.status).toBe('rechazado');
    });

    it('rechazado es terminal: aprobar o dejar en seguimiento da 409 y no cambia nada', async () => {
      candidates = [candidate(C1, { status: 'rechazado' })];
      for (const decision of ['aprobar', 'seguimiento']) {
        const res = await decide(C1, { decision });
        expect(res.status).toBe(409);
      }
      expect(candidates[0].status).toBe('rechazado');
      expect(bridge).toHaveLength(0);
      expect(history).toHaveLength(0);
    });

    it('el cambio manual de estado (Kanban) sí reactiva un rechazo global anterior a seguimiento', async () => {
      candidates = [candidate(C1, { status: 'rechazado' })];
      bridge = [presentedRow(C1, { presented_to_company: false, status: 'rechazado' })];

      const res = await request(app).patch(`/api/candidates/${C1}/status`).send({ status: 'seguimiento', reason: 'Reconsiderado' });

      expect(res.status).toBe(200);
      expect(candidates[0].status).toBe('seguimiento');
      expect(bridge[0]).toMatchObject({ status: 'seguimiento', presented_to_company: false });
      expect(history[0]).toMatchObject({ from_status: 'rechazado', to_status: 'seguimiento', reason: 'Reconsiderado' });
      // Solo a seguimiento: no salta directo a en contacto
      candidates[0].status = 'rechazado';
      expect((await request(app).patch(`/api/candidates/${C1}/status`).send({ status: 'en_contacto' })).status).toBe(400);
    });

    it('rechazar a un rechazado que aún figura como aprobado limpia la lista sin duplicar historial', async () => {
      candidates = [candidate(C1, { status: 'rechazado' })];
      bridge = [presentedRow(C1, { status: 'rechazado' })];
      const res = await decide(C1, { decision: 'rechazar' });
      expect(res.status).toBe(200);
      expect(bridge[0].presented_to_company).toBe(false);
      expect(history).toHaveLength(0);
    });
  });

  describe('robustez', () => {
    it('500 genérico sin detalles si falla la base y el reintento completa lo que faltó', async () => {
      bridge = [presentedRow(C1)];
      failTable = 'company_candidates';
      const failed = await decide(C1, { decision: 'rechazar' });
      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({ error: 'Error interno' });
      expect(JSON.stringify(failed.body)).not.toContain('boom');
      // el estado ya cambió, la lista no: sigue figurando como aprobado
      expect(candidates[0].status).toBe('rechazado');
      expect(bridge[0].presented_to_company).toBe(true);

      failTable = null;
      const retry = await decide(C1, { decision: 'rechazar' });
      expect(retry.status).toBe(200);
      expect(bridge[0].presented_to_company).toBe(false);
      expect(history).toHaveLength(1); // el reintento no duplica el historial
    });

    it('el log del servidor muestra la causa real del error de Supabase, no "[object Object]"', async () => {
      failTable = 'candidates';
      candidates = [candidate(C1, { status: 'en_contacto' })];
      await decide(C1, { decision: 'seguimiento' });

      // logger.error es un vi.fn() (mock del módulo): sus tipos de winston no describen (mensaje, meta)
      const calls = (logger.error as unknown as { mock: { calls: [string, { error: string }][] } }).mock.calls;
      const call = calls.find(([m]) => m === 'Error aplicando decisión sobre candidato');
      expect(call).toBeDefined();
      const logged = String(call![1].error);
      expect(logged).toContain('boom');
      expect(logged).not.toContain('[object Object]');
    });

    it('la respuesta nunca incluye email ni teléfono', async () => {
      const res = await decide(C1, { decision: 'aprobar' });
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('privado.com');
      expect(body).not.toContain('3000000000');
    });
  });

  describe('cambio de estado manual (kanban / panel)', () => {
    it('pasar a rechazado también saca al candidato de la lista de aceptados', async () => {
      bridge = [presentedRow(C1)];
      const res = await request(app).patch(`/api/candidates/${C1}/status`).send({ status: 'rechazado' });
      expect(res.status).toBe(200);
      expect(bridge[0]).toMatchObject({ presented_to_company: false, status: 'rechazado' });
    });

    it('pasar a en_contacto no toca la lista de aceptados', async () => {
      bridge = [presentedRow(C1)];
      const res = await request(app).patch(`/api/candidates/${C1}/status`).send({ status: 'en_contacto' });
      expect(res.status).toBe(200);
      expect(bridge[0].presented_to_company).toBe(true);
    });

    it('si la empresa ya decidió (contratado/descartado), ni la decisión ni el cambio de estado pueden pisarlo: 409', async () => {
      for (const companyDecision of ['contratado', 'descartado']) {
        candidates = [candidate(C1)];
        bridge = [presentedRow(C1, { company_decision: companyDecision })];

        const decision = await decide(C1, { decision: 'rechazar' });
        const status = await request(app).patch(`/api/candidates/${C1}/status`).send({ status: 'rechazado' });

        expect(decision.status).toBe(409);
        expect(status.status).toBe(409);
        expect(candidates[0].status).toBe('seguimiento');
        expect(bridge[0]).toMatchObject({ presented_to_company: true, company_decision: companyDecision });
      }
    });

    it('con la decisión de la empresa en "pendiente" el reclutador sigue pudiendo cambiar el estado', async () => {
      bridge = [presentedRow(C1, { company_decision: 'pendiente' })];
      expect((await request(app).patch(`/api/candidates/${C1}/status`).send({ status: 'en_contacto' })).status).toBe(200);
    });

    it('stand_by ya no es un estado válido', async () => {
      const res = await request(app).patch(`/api/candidates/${C1}/status`).send({ status: 'stand_by' });
      expect(res.status).toBe(400);
      expect(candidates[0].status).toBe('seguimiento');
    });
  });
});

describe('GET /api/candidates/decisions', () => {
  let app: express.Express;
  const lookup = (ids: string) => request(app).get(`/api/candidates/decisions?ids=${ids}`);

  beforeEach(async () => {
    vi.clearAllMocks();
    candidates = [
      candidate(C1),
      candidate(C2, { status: 'en_contacto' }),
      candidate(FOREIGN, { company_id: OTHER_CO }),
    ];
    bridge = [presentedRow(C1)];
    history = [];
    vacancies = [
      { id: VAC, company_id: CO, title: 'Contador', status: 'active' },
      { id: VAC2, company_id: CO, title: 'Auxiliar', status: 'active' },
    ];
    failTable = null;
    app = await buildApp();
  });

  it('devuelve estado y si está aprobado, solo de candidatos de la empresa', async () => {
    const res = await lookup(`${C1},${C2},${FOREIGN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      [C1]: { status: 'seguimiento', presented: true, vacancy_id: VAC },
      [C2]: { status: 'en_contacto', presented: false, vacancy_id: VAC },
    });
  });

  it('no filtra datos personales', async () => {
    const res = await lookup(C1);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('privado.com');
    expect(body).not.toContain('3000000000');
  });

  it('sin ids devuelve {}; con un id inválido o más de 100, 400', async () => {
    expect((await lookup('')).body).toEqual({});
    expect((await lookup(`${C1},no-uuid`)).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',');
    expect((await lookup(many)).status).toBe(400);
  });

  it('no choca con GET /:id (la ruta fija se registra antes)', async () => {
    const res = await lookup(C1);
    expect(res.body[C1]).toBeDefined();
  });
});
