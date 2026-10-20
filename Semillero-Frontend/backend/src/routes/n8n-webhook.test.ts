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

type Row = Record<string, unknown> & { id: string };

// Estado de la "base de datos" falsa
let companyExists = true;
let rows: Row[] = [];
let insertImpl: (payload: Row) => { data: { id: string } | null; error: { code: string } | null };
const inserts: Row[] = [];
const updates: { id: unknown; patch: Record<string, unknown> }[] = [];
const mockFromCalls = vi.fn();

function candidatesBuilder() {
  let op: 'select' | 'insert' | 'update' | null = null;
  let payload: Record<string, unknown> = {};
  const filters: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  const resolve = () => {
    if (op === 'insert') return insertImpl(payload as Row);
    if (op === 'update') {
      updates.push({ id: filters.id, patch: payload });
      return { data: null, error: null };
    }
    return { data: rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v)), error: null };
  };
  b.select = () => { op ??= 'select'; return b; };
  b.insert = (p: Row[]) => { op = 'insert'; payload = p[0]; return b; };
  b.update = (p: Record<string, unknown>) => { op = 'update'; payload = p; return b; };
  b.eq = (k: string, v: unknown) => { filters[k] = v; return b; };
  b.limit = () => b;
  b.single = () => Promise.resolve(resolve());
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      mockFromCalls(table);
      if (table === 'companies') {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.single = () =>
          Promise.resolve(companyExists ? { data: { id: 'x' }, error: null } : { data: null, error: { message: 'nf' } });
        return b;
      }
      return candidatesBuilder();
    },
  }),
}));

const COMPANY = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const SECRET = 'inbound-secret';

const validBody = (over: Record<string, unknown> = {}) => ({
  company_id: COMPANY,
  IdSolicitud: 'req-1',
  Nombre: 'Ana García',
  'Correo Personal': 'Ana@Example.com',
  urlLinkedin: 'https://www.linkedin.com/in/ana-garcia/',
  'Especializacion/descripcion': 'Desarrolladora React',
  Experiencia: '4',
  Aspiracion: 5000000,
  'Fecha de busqueda': '2026-05-01',
  ...over,
});

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const { n8nSecret } = await import('../middlewares/n8nSecret');
  const { default: router } = await import('./n8n-webhook');
  app.use('/api/n8n-webhook', n8nSecret, router);
  return app;
};

describe('POST /api/n8n-webhook', () => {
  let app: express.Express;
  const post = (body: unknown, secret: string | null = SECRET) => {
    const r = request(app).post('/api/n8n-webhook');
    if (secret !== null) r.set('X-N8N-Secret', secret);
    return r.send(body as object);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    cfg.SUPABASE_URL = 'https://test.supabase.co';
    cfg.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    cfg.N8N_WEBHOOK_SECRET = SECRET;
    companyExists = true;
    rows = [];
    inserts.length = 0;
    updates.length = 0;
    let n = 0;
    insertImpl = (p) => {
      const id = `cand-${++n}`;
      inserts.push(p);
      rows.push({ ...p, id });
      return { data: { id }, error: null };
    };
    app = await buildApp();
  });

  describe('autenticación', () => {
    it('503 si el secreto no está configurado (falla cerrado)', async () => {
      cfg.N8N_WEBHOOK_SECRET = undefined;
      const res = await post(validBody());
      expect(res.status).toBe(503);
      expect(mockFromCalls).not.toHaveBeenCalled();
    });

    it('401 sin cabecera X-N8N-Secret, sin tocar la base de datos', async () => {
      const res = await post(validBody(), null);
      expect(res.status).toBe(401);
      expect(mockFromCalls).not.toHaveBeenCalled();
    });

    it('401 con secreto erróneo (misma longitud y distinta longitud)', async () => {
      for (const bad of ['x'.repeat(SECRET.length), 'corto']) {
        const res = await post(validBody(), bad);
        expect(res.status).toBe(401);
      }
      expect(mockFromCalls).not.toHaveBeenCalled();
    });
  });

  describe('validación', () => {
    it('400 con company_id que no es uuid', async () => {
      const res = await post(validBody({ company_id: 'no-uuid' }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toContain('company_id');
      expect(mockFromCalls).not.toHaveBeenCalled();
    });

    it('400 con correo mal formado, URL que no es de LinkedIn y fecha inválida', async () => {
      expect((await post(validBody({ 'Correo Personal': 'no-es-correo' }))).status).toBe(400);
      expect((await post(validBody({ urlLinkedin: 'https://evil.com/in/ana' }))).status).toBe(400);
      expect((await post(validBody({ urlLinkedin: 'https://evil.com/?x=linkedin.com' }))).status).toBe(400);
      expect((await post(validBody({ 'Fecha de busqueda': 'no-es-fecha' }))).status).toBe(400);
      expect(inserts).toHaveLength(0);
    });

    it('400 sin Nombre o con Experiencia negativa', async () => {
      expect((await post(validBody({ Nombre: '' }))).status).toBe(400);
      expect((await post(validBody({ Experiencia: -1 }))).status).toBe(400);
    });

    it('acepta campos opcionales vacíos', async () => {
      const res = await post(validBody({ 'Correo Personal': '', urlLinkedin: '', Experiencia: '', 'Fecha de busqueda': '' }));
      expect(res.status).toBe(200);
      expect(inserts[0]).toMatchObject({ email: null, linkedin_url: null, experience_years: null, n8n_search_date: null });
    });

    it('404 si la empresa no existe', async () => {
      companyExists = false;
      const res = await post(validBody());
      expect(res.status).toBe(404);
      expect(inserts).toHaveLength(0);
    });
  });

  describe('inserción', () => {
    it('inserta un candidato nuevo y devuelve solo { success, action, candidate_id }', async () => {
      const res = await post(validBody());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, action: 'inserted', candidate_id: 'cand-1' });
      expect(inserts[0]).toMatchObject({
        company_id: COMPANY,
        full_name: 'Ana García',
        email: 'ana@example.com',
        linkedin_url: 'https://www.linkedin.com/in/ana-garcia',
        experience_years: 4,
        expected_salary: 5000000,
        status: 'seguimiento',
        source: 'scraping',
        n8n_request_id: 'req-1',
      });
      expect(JSON.stringify(res.body)).not.toContain('example.com');
    });

    it('dos personas distintas con la misma IdSolicitud se conservan ambas', async () => {
      await post(validBody({ Nombre: 'Ana García', 'Correo Personal': 'ana@x.com', urlLinkedin: '' }));
      const res = await post(validBody({ Nombre: 'Luis Pérez', 'Correo Personal': 'luis@x.com', urlLinkedin: '' }));
      expect(res.body.action).toBe('inserted');
      expect(inserts).toHaveLength(2);
      expect(updates).toHaveLength(0);
    });

    it('sin LinkedIn ni correo, deduplica por (IdSolicitud, nombre)', async () => {
      const body = validBody({ 'Correo Personal': '', urlLinkedin: '' });
      await post(body);
      const res = await post({ ...body, Nombre: 'ana garcía' });
      expect(res.body.action).toBe('updated');
      expect(inserts).toHaveLength(1);
    });
  });

  describe('deduplicación', () => {
    it('duplicado por LinkedIn: actualiza solo campos vacíos y no toca status, created_by ni company_id', async () => {
      rows.push({
        id: 'cand-existing',
        company_id: COMPANY,
        full_name: 'Ana García',
        linkedin_url: 'https://www.linkedin.com/in/ana-garcia',
        email: null,
        position: '',
        experience_years: 10, // ya curado: no se pisa
        expected_salary: null,
        status: 'en_contacto',
        created_by: 'recruiter-1',
        vacancy_id: 'vac-1',
      });

      const res = await post(validBody({ IdSolicitud: 'req-9' }));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, action: 'updated', candidate_id: 'cand-existing' });
      expect(inserts).toHaveLength(0);
      expect(updates).toHaveLength(1);
      const { patch } = updates[0];
      expect(patch).toMatchObject({ email: 'ana@example.com', position: 'Desarrolladora React', expected_salary: 5000000 });
      expect(patch).not.toHaveProperty('experience_years');
      for (const protectedKey of ['status', 'created_by', 'company_id', 'vacancy_id']) {
        expect(patch).not.toHaveProperty(protectedKey);
      }
    });

    it('duplicado por correo (sin importar mayúsculas)', async () => {
      rows.push({ id: 'cand-e', company_id: COMPANY, full_name: 'A', email: 'ana@example.com', linkedin_url: 'x', position: 'p' });
      const res = await post(validBody({ urlLinkedin: '' }));
      expect(res.body).toMatchObject({ action: 'updated', candidate_id: 'cand-e' });
      expect(inserts).toHaveLength(0);
    });

    it('un duplicado completo no genera update', async () => {
      rows.push({
        id: 'cand-full', company_id: COMPANY, full_name: 'Ana García', email: 'ana@example.com',
        linkedin_url: 'https://www.linkedin.com/in/ana-garcia', position: 'x', experience_years: 1,
        expected_salary: 1, n8n_request_id: 'r', n8n_search_date: 'd',
      });
      const res = await post(validBody());
      expect(res.body.action).toBe('updated');
      expect(updates).toHaveLength(0);
    });

    it('carrera: insert devuelve 23505 → reintenta la búsqueda y actualiza', async () => {
      insertImpl = (p) => {
        // otra petición insertó el mismo candidato justo antes
        rows.push({ ...p, id: 'cand-race', email: null, position: '' });
        return { data: null, error: { code: '23505' } };
      };
      const res = await post(validBody());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, action: 'updated', candidate_id: 'cand-race' });
      expect(updates).toHaveLength(1);
      expect(updates[0].patch).not.toHaveProperty('status');
    });

    it('otro error de base de datos → 500 sin filtrar detalles', async () => {
      insertImpl = () => ({ data: null, error: { code: '42P01' } });
      const res = await post(validBody());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Error al procesar webhook de n8n' });
    });
  });
});
