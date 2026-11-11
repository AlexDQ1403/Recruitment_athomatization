import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

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
  getCorrelationId: () => 'test-correlation-id',
}));

type Row = Record<string, unknown>;

// "Base de datos" en memoria: solo lo que usa el router (eq, order, limit, maybeSingle, insert).
let db: Record<string, Row[]> = {};

function builder(table: string) {
  const filters: [string, unknown][] = [];
  let insertPayload: Row | null = null;
  let deleting = false;
  const rows = () => (db[table] ??= []).filter((r) => filters.every(([k, v]) => r[k] === v));
  const first = () => {
    if (insertPayload) {
      // Índices únicos de candidate_rejections (migración 027): mismo candidato + puesto → 23505
      if (table === 'candidate_rejections' && db[table].some((r) =>
        r.company_id === insertPayload!.company_id && r.role_key === insertPayload!.role_key &&
        ((insertPayload!.legacy_candidate_id && r.legacy_candidate_id === insertPayload!.legacy_candidate_id) ||
          (insertPayload!.candidate_profile_id && r.candidate_profile_id === insertPayload!.candidate_profile_id)))) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      const row = { id: `rej-${db[table].length + 1}`, created_at: '2026-11-09T10:00:00Z', ...insertPayload };
      db[table].push(row);
      return { data: row, error: null };
    }
    return { data: rows()[0] ?? null, error: null };
  };
  const all = () => {
    if (!deleting) return { data: rows(), error: null };
    const hit = rows();
    db[table] = db[table].filter((r) => !hit.includes(r));
    return { data: hit, error: null };
  };
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = (k: string, v: unknown) => { filters.push([k, v]); return b; };
  b.order = () => b;
  b.limit = () => b;
  b.insert = (p: Row) => { insertPayload = p; (db[table] ??= []); return b; };
  b.delete = () => { deleting = true; return b; };
  b.maybeSingle = () => Promise.resolve(first());
  b.single = () => Promise.resolve(first());
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
    Promise.resolve(all()).then(ok, ko);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}));

const COMPANY = 'company-1';
const LEGACY_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const VACANCY = '44444444-4444-4444-8444-444444444444';
const FOREIGN_VACANCY = '55555555-5555-4555-8555-555555555555';

const seed = () => {
  db = {
    companies: [{ id: COMPANY, name: 'Acme SAS' }],
    candidates: [
      {
        id: LEGACY_ID, company_id: COMPANY, full_name: 'Laura Ríos', position: 'Contadora',
        headline: 'Contadora Pública | NIIF', summary: 'Auditoría y revisoría fiscal.',
        email: 'laura@correo.com', phone: '300 123 4567', linkedin_url: 'https://www.linkedin.com/in/laura-rios',
        location: 'Cali', experience_years: 6, expected_salary: null, source: 'scraping', status: 'seguimiento',
        resume_url: null, profile_url: null,
      },
      // Mismo candidato pero de otra empresa: nunca debe verse
      { id: OTHER_ID, company_id: 'company-2', full_name: 'Ajeno', position: 'X', source: 'internal', status: 'seguimiento' },
    ],
    company_candidates: [{ company_id: COMPANY, candidate_profile_id: PROFILE_ID, status: 'seguimiento', source: 'applicant' }],
    candidate_profiles: [{
      id: PROFILE_ID, position: 'Analista contable', professional_title: 'Analista contable senior',
      professional_summary: 'Cierres contables y conciliaciones.', experience_years: 4, expected_salary: 3500000,
      location: 'Bogotá', phone: '3109998877', cv_url: 'https://files/cv.pdf', linkedin_url: null, visible: true,
      profiles: { full_name: 'Mario Díaz', email: 'mario@correo.com' },
    }],
    candidate_experience: [{ candidate_profile_id: PROFILE_ID, company_name: 'Contables SA', role_title: 'Analista', start_date: '2022-01-01', end_date: null, description: null }],
    candidate_education: [{ candidate_profile_id: PROFILE_ID, institution: 'U. Nacional', degree: 'Contaduría Pública', start_date: null, end_date: '2021-12-01' }],
    candidate_skills: [{ candidate_profile_id: PROFILE_ID, name: 'SIIGO', category: 'herramienta' }],
    candidate_contact_log: [],
    candidate_rejections: [],
    vacancies: [
      { id: VACANCY, company_id: COMPANY, title: 'Contador Público' },
      { id: FOREIGN_VACANCY, company_id: 'company-2', title: 'Contador' },
    ],
  };
};

let role = 'recruiter';
const buildApp = async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { locals: unknown }).locals = {
      user: { id: 'user-1', email: 'rec@acme.com' },
      companyId: COMPANY,
      profile: { role, full_name: 'Sofía Reclutadora' },
    };
    next();
  });
  const { default: router } = await import('./candidate-profiles');
  app.use('/api/candidate-profiles', router);
  return app;
};

describe('/api/candidate-profiles', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    seed();
    app = await buildApp();
  });

  describe('GET /:kind/:id', () => {
    it('candidato externo: titular y extracto de LinkedIn, contacto con teléfono listo para WhatsApp', async () => {
      const res = await request(app).get(`/api/candidate-profiles/legacy/${LEGACY_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        kind: 'legacy',
        full_name: 'Laura Ríos',
        headline: 'Contadora Pública | NIIF',
        summary: 'Auditoría y revisoría fiscal.',
        contact: { email: 'laura@correo.com', phone: '+573001234567', linkedin_url: 'https://www.linkedin.com/in/laura-rios' },
        sender: { recruiter_name: 'Sofía Reclutadora', company_name: 'Acme SAS' },
        last_contact: null,
      });
    });

    it('candidato que se postuló: hoja de vida completa (experiencia, formación, habilidades)', async () => {
      const res = await request(app).get(`/api/candidate-profiles/profile/${PROFILE_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        kind: 'profile',
        full_name: 'Mario Díaz',
        headline: 'Analista contable senior',
        summary: 'Cierres contables y conciliaciones.',
        resume_url: 'https://files/cv.pdf',
        contact: { email: 'mario@correo.com', phone: '+573109998877' },
      });
      expect(res.body.experience).toHaveLength(1);
      expect(res.body.education[0].degree).toBe('Contaduría Pública');
      expect(res.body.skills).toMatchObject([{ name: 'SIIGO', category: 'herramienta' }]);
    });

    it("'auto' resuelve el origen (mensajes del chat anteriores a kind)", async () => {
      expect((await request(app).get(`/api/candidate-profiles/auto/${LEGACY_ID}`)).body.kind).toBe('legacy');
      expect((await request(app).get(`/api/candidate-profiles/auto/${PROFILE_ID}`)).body.kind).toBe('profile');
    });

    it('404 con un candidato de otra empresa (no filtra que existe)', async () => {
      const res = await request(app).get(`/api/candidate-profiles/legacy/${OTHER_ID}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Ajeno');
    });

    it('404 con un perfil sin relación con la empresa o que se ocultó', async () => {
      db.company_candidates = [];
      expect((await request(app).get(`/api/candidate-profiles/profile/${PROFILE_ID}`)).status).toBe(404);

      seed();
      db.candidate_profiles[0].visible = false;
      expect((await request(app).get(`/api/candidate-profiles/profile/${PROFILE_ID}`)).status).toBe(404);
    });

    it('400 con kind desconocido o id que no es uuid', async () => {
      expect((await request(app).get(`/api/candidate-profiles/otro/${LEGACY_ID}`)).status).toBe(400);
      expect((await request(app).get('/api/candidate-profiles/legacy/123')).status).toBe(400);
    });
  });

  describe('POST /:kind/:id/contact', () => {
    it('registra el canal y lo devuelve como último contacto', async () => {
      const post = await request(app).post(`/api/candidate-profiles/legacy/${LEGACY_ID}/contact`).send({ channel: 'whatsapp' });
      expect(post.status).toBe(201);
      expect(post.body.channel).toBe('whatsapp');
      expect(db.candidate_contact_log[0]).toMatchObject({
        company_id: COMPANY, recruiter_id: 'user-1', legacy_candidate_id: LEGACY_ID, channel: 'whatsapp',
      });

      const get = await request(app).get(`/api/candidate-profiles/legacy/${LEGACY_ID}`);
      expect(get.body.last_contact).toMatchObject({ channel: 'whatsapp' });
    });

    it('perfil propio se registra en candidate_profile_id', async () => {
      const res = await request(app).post(`/api/candidate-profiles/profile/${PROFILE_ID}/contact`).send({ channel: 'email' });
      expect(res.status).toBe(201);
      expect(db.candidate_contact_log[0]).toMatchObject({ candidate_profile_id: PROFILE_ID, channel: 'email' });
      expect(db.candidate_contact_log[0].legacy_candidate_id).toBeUndefined();
    });

    it('400 con canal no permitido; 404 con candidato ajeno, sin escribir nada', async () => {
      expect((await request(app).post(`/api/candidate-profiles/legacy/${LEGACY_ID}/contact`).send({ channel: 'sms' })).status).toBe(400);
      expect((await request(app).post(`/api/candidate-profiles/legacy/${OTHER_ID}/contact`).send({ channel: 'email' })).status).toBe(404);
      expect(db.candidate_contact_log).toHaveLength(0);
    });
  });

  describe('rechazos por puesto', () => {
    const reject = (body: object, id = LEGACY_ID, kind = 'legacy') =>
      request(app).post(`/api/candidate-profiles/${kind}/${id}/rejections`).send(body);

    it('rechaza para un puesto con motivo y aparece en el perfil; no toca el estado global', async () => {
      const res = await reject({ role: 'Contador público', reason: 'Sin manejo de NIIF' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: 'legacy', candidate_id: LEGACY_ID, role_label: 'Contador público', role_key: 'contad publi', reason: 'Sin manejo de NIIF' });
      expect(db.candidate_rejections[0]).toMatchObject({ company_id: COMPANY, legacy_candidate_id: LEGACY_ID, rejected_by: 'user-1' });
      expect(db.candidates.find((c) => c.id === LEGACY_ID)?.status).toBe('seguimiento');

      const profile = await request(app).get(`/api/candidate-profiles/legacy/${LEGACY_ID}`);
      expect(profile.body.rejections).toMatchObject([{ role_label: 'Contador público' }]);
    });

    it('el mismo puesto dos veces no duplica (aunque cambie la redacción)', async () => {
      expect((await reject({ role: 'Contador Público' })).status).toBe(201);
      const again = await reject({ role: 'público contador' });
      expect(again.status).toBe(200);
      expect(db.candidate_rejections).toHaveLength(1);
    });

    it('con vacante: usa su título como puesto; una vacante de otra empresa da 404', async () => {
      const res = await reject({ vacancy_id: VACANCY }, PROFILE_ID, 'profile');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: 'profile', role_label: 'Contador Público', vacancy_id: VACANCY });
      expect((await reject({ vacancy_id: FOREIGN_VACANCY })).status).toBe(404);
    });

    it('400 sin puesto ni vacante, o con un puesto que no describe un cargo; 404 con candidato ajeno', async () => {
      expect((await reject({ reason: 'x' })).status).toBe(400);
      expect((await reject({ role: 'vacante' })).status).toBe(400);
      expect((await reject({ role: 'Contador' }, OTHER_ID)).status).toBe(404);
      expect(db.candidate_rejections).toHaveLength(0);
    });

    it('deshacer un rechazo lo borra; no se puede borrar el de otro candidato', async () => {
      const { body } = await reject({ role: 'Contador' });
      expect((await request(app).delete(`/api/candidate-profiles/profile/${PROFILE_ID}/rejections/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`)).status).toBe(404);
      db.candidate_rejections[0].id = '66666666-6666-4666-8666-666666666666';
      const del = await request(app).delete(`/api/candidate-profiles/legacy/${LEGACY_ID}/rejections/66666666-6666-4666-8666-666666666666`);
      expect(del.status).toBe(204);
      expect(db.candidate_rejections).toHaveLength(0);
      expect(body.role_label).toBe('Contador');
    });
  });

  describe('la empresa (solo consulta lo que le presentaron)', () => {
    beforeEach(async () => {
      role = 'empresa';
      app = await buildApp();
    });
    afterEach(() => { role = 'recruiter'; });

    it('404 si no se lo presentaron', async () => {
      expect((await request(app).get(`/api/candidate-profiles/legacy/${LEGACY_ID}`)).status).toBe(404);
    });

    it('presentado: ve el perfil y quién lo presentó, sin teléfono ni correo ni notas internas', async () => {
      db.company_candidates.push({ company_id: COMPANY, legacy_candidate_id: LEGACY_ID, presented_to_company: true, presented_at: '2026-11-08T10:00:00Z', presented_by: 'user-9', company_decision: 'pendiente' });
      db.profiles = [{ id: 'user-9', company_id: COMPANY, full_name: 'Andrés Reclutador' }];
      db.candidate_rejections.push({ id: 'r1', company_id: COMPANY, legacy_candidate_id: LEGACY_ID, role_label: 'Auditor', role_key: 'audit', created_at: '2026-11-01' });
      const res = await request(app).get(`/api/candidate-profiles/legacy/${LEGACY_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.contact).toEqual({ email: null, phone: null, linkedin_url: 'https://www.linkedin.com/in/laura-rios' });
      expect(res.body.rejections).toEqual([]);
      expect(res.body.presentation).toMatchObject({ presented: true, presented_by: 'Andrés Reclutador', company_decision: 'pendiente' });
      expect(JSON.stringify(res.body)).not.toContain('laura@correo.com');
    });

    it('contratado: ya ve los datos de contacto', async () => {
      db.company_candidates.push({ company_id: COMPANY, legacy_candidate_id: LEGACY_ID, presented_to_company: true, company_decision: 'contratado' });
      const res = await request(app).get(`/api/candidate-profiles/legacy/${LEGACY_ID}`);
      expect(res.body.contact.email).toBe('laura@correo.com');
    });

    it('no puede contactar ni rechazar (403)', async () => {
      expect((await request(app).post(`/api/candidate-profiles/legacy/${LEGACY_ID}/contact`).send({ channel: 'email' })).status).toBe(403);
      expect((await request(app).post(`/api/candidate-profiles/legacy/${LEGACY_ID}/rejections`).send({ role: 'Contador' })).status).toBe(403);
    });
  });
});
