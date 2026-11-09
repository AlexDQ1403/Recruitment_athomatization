import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { logger } from '../utils/logger';
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

type Row = Record<string, unknown>;

// "Base de datos" falsa de las dos tablas que toca la ruta
let companies: Row[] = [];
let vacancies: Row[] = [];
let insertError: { code?: string; message: string } | null = null;

function builder(table: string) {
  const filters: [string, unknown][] = [];
  let op: 'select' | 'insert' = 'select';
  let payload: Row = {};
  const b: Record<string, unknown> = {};
  const run = () => {
    if (table === 'vacancies' && op === 'insert') {
      if (insertError) return { data: null, error: insertError };
      const row = { id: 'vac-1', created_at: '2026-01-01', updated_at: '2026-01-01', ...payload };
      vacancies.push(row);
      return { data: [row], error: null };
    }
    const rows = table === 'companies' ? companies : vacancies;
    return { data: rows.filter((r) => filters.every(([k, v]) => r[k] === v)), error: null };
  };
  b.select = () => b;
  b.eq = (k: string, v: unknown) => { filters.push([k, v]); return b; };
  b.insert = (p: Row) => { op = 'insert'; payload = p; return b; };
  b.single = () => {
    const r = run();
    return Promise.resolve(r.error ? { data: null, error: r.error } : r.data && r.data[0] ? { data: r.data[0], error: null } : { data: null, error: { message: 'not found' } });
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}));

const COMPANY_ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const OTHER_COMPANY = '9a9a9a9a-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

const buildApp = async (locals: AuthenticatedRequest['locals']) => {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & AuthenticatedRequest, _res, next) => {
    req.locals = locals;
    next();
  });
  const { default: router } = await import('./vacancies');
  app.use('/api/vacancies', router);
  return app;
};

const asRole = (role: string, companyId: string | undefined = COMPANY_ID) =>
  buildApp({ user: { id: 'user-1', email: 'u@test.com' }, profile: { id: 'user-1', role }, companyId } as AuthenticatedRequest['locals']);

const validBody = (over: Row = {}) => ({
  title: 'Desarrollador Frontend React',
  modality: 'remoto',
  description: 'Buscamos a alguien con experiencia',
  location: 'Bogotá',
  salary_min: 3000000,
  salary_max: 6000000,
  experience_years_min: 2,
  skills: ['React', 'TypeScript'],
  deadline: '2026-12-31',
  ...over,
});

describe('POST /api/vacancies', () => {
  let app: express.Express;
  const post = (body: unknown) => request(app).post('/api/vacancies').send(body as object);

  beforeEach(async () => {
    vi.clearAllMocks();
    companies = [{ id: COMPANY_ID, name: 'Acme S.A.S.' }, { id: OTHER_COMPANY, name: 'Otra Empresa' }];
    vacancies = [];
    insertError = null;
    app = await asRole('recruiter');
  });

  describe('publicar', () => {
    it('un reclutador publica: la vacante queda de SU empresa, con su nombre y activa', async () => {
      const res = await post(validBody());

      expect(res.status).toBe(201);
      expect(vacancies).toHaveLength(1);
      expect(vacancies[0]).toMatchObject({
        company_id: COMPANY_ID,
        company: 'Acme S.A.S.',
        created_by: 'user-1',
        status: 'active',
        title: 'Desarrollador Frontend React',
        modality: 'remoto',
        skills: ['React', 'TypeScript'],
        experience_years_min: 2,
      });
      expect(res.body.id).toBe('vac-1');
    });

    it('la empresa también puede publicar', async () => {
      app = await asRole('empresa');
      expect((await post(validBody())).status).toBe(201);
    });

    it('REGRESIÓN: la inserción siempre lleva company_id (la política RLS lo exige y su ausencia hacía fallar la publicación)', async () => {
      await post(validBody());
      expect(vacancies[0].company_id).toBe(COMPANY_ID);
    });

    it('no pide ni usa el nombre de la empresa del cuerpo: el cliente no puede publicar a nombre de otra', async () => {
      const res = await post(validBody({
        company: 'Empresa Falsa', company_id: OTHER_COMPANY, status: 'closed', created_by: 'otro-usuario',
      }));

      expect(res.status).toBe(201);
      expect(vacancies[0]).toMatchObject({ company_id: COMPANY_ID, company: 'Acme S.A.S.', status: 'active', created_by: 'user-1' });
    });

    it('sin el campo empresa en el cuerpo funciona (el formulario ya no lo envía)', async () => {
      const body = validBody() as Row;
      expect('company' in body).toBe(false);
      expect((await post(body)).status).toBe(201);
    });

    it('los campos opcionales vacíos del formulario ("" ) se guardan como nulos', async () => {
      const res = await post({ title: 'Analista', modality: 'presencial', description: '', location: '', deadline: '', skills: [] });

      expect(res.status).toBe(201);
      expect(vacancies[0]).toMatchObject({
        description: null, location: null, deadline: null, salary_min: null, salary_max: null, skills: [], experience_years_min: 0,
      });
    });
  });

  describe('esquema', () => {
    it('la inserción solo escribe columnas que las migraciones del repo definen (coherencia código↔migraciones; el desfase con la base real lo detecta npm run check:schema)', async () => {
      await post(validBody());
      const defined = vacanciesColumnsFromMigrations();

      // sanidad: el lector de migraciones encuentra lo esencial (si no, la comprobación no vale)
      for (const c of ['title', 'company_id', 'status', 'salary_min', 'salary_max', 'experience_years_min', 'skills']) {
        expect(defined, `la migración debe definir ${c}`).toContain(c);
      }
      const undefinedColumns = Object.keys(vacancies[0]).filter((k) => !defined.has(k) && !['id'].includes(k));
      expect(undefinedColumns).toEqual([]);
    });
  });

  describe('autorización', () => {
    it('403 para un candidato; no escribe nada', async () => {
      app = await asRole('candidato');
      const res = await post(validBody());
      expect(res.status).toBe(403);
      expect(vacancies).toHaveLength(0);
    });

    it('403 sin empresa asociada (superAdmin no publica a nombre de nadie)', async () => {
      app = await asRole('superAdmin', undefined);
      expect((await post(validBody())).status).toBe(403);
      expect(vacancies).toHaveLength(0);
    });

    it('403 si la empresa del usuario ya no existe', async () => {
      companies = [];
      expect((await post(validBody())).status).toBe(403);
      expect(vacancies).toHaveLength(0);
    });
  });

  describe('validación', () => {
    it('400 sin cargo, con cargo de 1 letra o con modalidad desconocida', async () => {
      expect((await post(validBody({ title: '' }))).status).toBe(400);
      expect((await post(validBody({ title: 'A' }))).status).toBe(400);
      expect((await post(validBody({ modality: 'volando' }))).status).toBe(400);
      expect((await post({ modality: 'remoto' })).status).toBe(400);
      expect(vacancies).toHaveLength(0);
    });

    it('400 si el salario mínimo supera al máximo', async () => {
      const res = await post(validBody({ salary_min: 9000000, salary_max: 1000000 }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/salario/i);
    });

    it('400 con salarios negativos, experiencia fuera de rango, fecha mal formada o demasiadas habilidades', async () => {
      expect((await post(validBody({ salary_min: -1 }))).status).toBe(400);
      expect((await post(validBody({ experience_years_min: 99 }))).status).toBe(400);
      expect((await post(validBody({ deadline: '31/12/2026' }))).status).toBe(400);
      expect((await post(validBody({ skills: Array(31).fill('x') }))).status).toBe(400);
      expect(vacancies).toHaveLength(0);
    });
  });

  describe('robustez', () => {
    it('si una restricción CHECK de la base rechaza un valor ya validado (23514) también avisa de la actualización pendiente', async () => {
      insertError = { code: '23514', message: 'new row for relation "vacancies" violates check constraint "vacancies_modality_check"' };
      const res = await post(validBody());

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/administrador/i);
      expect(JSON.stringify(res.body)).not.toContain('vacancies_modality_check');
    });

    it('si a la base le falta una columna (migración pendiente) responde 503 con un aviso útil y sin revelar el esquema', async () => {
      insertError = { code: 'PGRST204', message: "Could not find the 'experience_years_min' column of 'vacancies' in the schema cache" };
      const res = await post(validBody());

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/administrador/i);
      expect(JSON.stringify(res.body)).not.toContain('experience_years_min');
      expect(JSON.stringify(res.body)).not.toContain('PGRST204');
    });

    it('500 genérico sin detalles si falla la base, y el log muestra la causa', async () => {
      insertError = { code: '23502', message: 'null value in column "company_id"' };
      const res = await post(validBody());

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Error interno' });
      expect(JSON.stringify(res.body)).not.toContain('company_id');
      const calls = (logger.error as unknown as { mock: { calls: [string, { error: string }][] } }).mock.calls;
      const logged = calls.find(([m]) => m === 'Error publicando vacante')?.[1].error ?? '';
      expect(logged).toContain('23502');
      expect(logged).not.toContain('[object Object]');
    });
  });
});
