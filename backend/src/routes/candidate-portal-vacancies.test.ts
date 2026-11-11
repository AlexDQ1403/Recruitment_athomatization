import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { vacanciesColumnsFromMigrations } from './vacanciesSchema.testutil';

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

// La sesión y el rol los resuelve el middleware real contra Supabase; aquí se simula un candidato
let role = 'candidato';
vi.mock('../middlewares/companyAuth', () => ({
  companyAuthMiddleware: (req: { locals?: unknown }, _res: unknown, next: () => void) => {
    req.locals = { user: { id: 'cand-user', email: 'c@test.com' }, profile: { id: 'cand-user', role } };
    next();
  },
}));

type Row = Record<string, unknown>;
let vacancies: Row[] = [];
let selectedColumns = '';
const eqCalls: [string, unknown][] = [];

function builder() {
  const filters: [string, unknown][] = [];
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => { selectedColumns = cols; return b; };
  b.eq = (k: string, v: unknown) => { filters.push([k, v]); eqCalls.push([k, v]); return b; };
  b.range = () => b;
  b.order = () => {
    const data = vacancies.filter((r) => filters.every(([k, v]) => r[k] === v));
    return Promise.resolve({ data, count: data.length, error: null });
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => (table === 'vacancies' ? builder() : builder()) }),
}));

const vacancy = (id: string, status: string, over: Row = {}): Row => ({
  id, status, title: `Cargo ${id}`, description: 'x', location: 'Bogotá', modality: 'remoto',
  salary_min: 1, salary_max: 2, experience_years_min: 0, skills: ['React'], deadline: null,
  company: { id: 'co-1', name: 'Acme S.A.S.' },
  ...over,
});

describe('GET /api/me/vacancies — catálogo de vacantes para el candidato', () => {
  let app: express.Express;
  const catalog = () => request(app).get('/api/me/vacancies');

  beforeEach(async () => {
    vi.clearAllMocks();
    role = 'candidato';
    vacancies = [];
    selectedColumns = '';
    eqCalls.length = 0;
    app = express();
    app.use(express.json());
    const { default: router } = await import('./candidate-portal');
    app.use('/api/me', router);
  });

  it('una vacante publicada (active) aparece en el catálogo con el nombre de su empresa', async () => {
    vacancies = [vacancy('v1', 'active')];

    const res = await catalog();

    expect(res.status).toBe(200);
    expect(res.body.vacancies.map((v: { id: string }) => v.id)).toEqual(['v1']);
    expect(res.body.vacancies[0].company).toEqual({ id: 'co-1', name: 'Acme S.A.S.' });
    expect(res.body.total).toBe(1);
  });

  it('solo se ven las active: pausadas y cerradas no aparecen', async () => {
    vacancies = [vacancy('activa', 'active'), vacancy('pausada', 'paused'), vacancy('cerrada', 'closed')];

    const res = await catalog();

    expect(res.body.vacancies.map((v: { id: string }) => v.id)).toEqual(['activa']);
    expect(eqCalls).toContainEqual(['status', 'active']);
  });

  it('al pausar una vacante deja de verse y al reactivarla vuelve', async () => {
    vacancies = [vacancy('v1', 'active')];
    expect((await catalog()).body.vacancies).toHaveLength(1);

    vacancies[0].status = 'paused';
    expect((await catalog()).body.vacancies).toHaveLength(0);

    vacancies[0].status = 'active';
    expect((await catalog()).body.vacancies).toHaveLength(1);
  });

  it('el criterio es el estado: una vacante active se muestra aunque su fecha límite ya pasó o no exista', async () => {
    vacancies = [
      vacancy('sin-fecha', 'active', { deadline: null }),
      vacancy('vencida', 'active', { deadline: '2020-01-01' }),
      vacancy('futura', 'active', { deadline: '2099-12-31' }),
    ];

    const res = await catalog();

    expect(res.body.vacancies.map((v: { id: string }) => v.id).sort()).toEqual(['futura', 'sin-fecha', 'vencida']);
  });

  it('ven las vacantes de todas las empresas (es un catálogo abierto a candidatos)', async () => {
    vacancies = [
      vacancy('a', 'active', { company: { id: 'co-1', name: 'Acme' } }),
      vacancy('b', 'active', { company: { id: 'co-2', name: 'Globex' } }),
    ];
    const res = await catalog();
    expect(res.body.vacancies.map((v: { company: { name: string } }) => v.company.name).sort()).toEqual(['Acme', 'Globex']);
  });

  it('no expone quién la creó ni datos internos de la empresa', async () => {
    vacancies = [vacancy('v1', 'active')];
    await catalog();
    expect(selectedColumns).not.toContain('created_by');
    expect(selectedColumns).not.toContain('company_id');
  });

  it('el catálogo solo pide columnas que las migraciones del repo definen (el desfase con la base real lo detecta npm run check:schema)', async () => {
    vacancies = [vacancy('v1', 'active')];
    await catalog();

    const defined = vacanciesColumnsFromMigrations();
    // columnas propias de vacancies (se descarta la relación embebida company:companies!inner(...))
    const asked = selectedColumns
      .replace(/company:companies![a-z]+\([^)]*\)/g, '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    expect(asked.length).toBeGreaterThan(5);
    expect(asked.filter((c) => !defined.has(c))).toEqual([]);
  });

  it('un usuario que no es candidato no accede al catálogo', async () => {
    role = 'recruiter';
    vacancies = [vacancy('v1', 'active')];
    expect((await catalog()).status).toBe(403);
  });
});
