import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import rateLimit from 'express-rate-limit';
import { draftVacancy, MAX_DRAFT_INPUT } from '../services/vacancyDraft';
import { searchTerms } from '../services/searchTerms';
import { sameRole } from '../services/rejections';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Toda la gestión de vacantes pasa por aquí, no por el navegador. Leer, editar y borrar
 * directo con la sesión del usuario dependía de las políticas RLS de `vacancies`, que en
 * la base real no coincidían con las del repo: la vacante se guardaba pero la lista salía
 * vacía, sin error. Aquí la empresa sale del token y cada consulta se acota a ella.
 */

const PUBLISHER_ROLES = ['empresa', 'recruiter'];
const MODALITIES = ['presencial', 'remoto', 'híbrido'] as const;
const STATUSES = ['active', 'paused', 'closed'] as const;

// Columnas que se devuelven al panel de la empresa (no incluye company_id)
const VACANCY_COLUMNS =
  'id, title, company, description, location, modality, salary_min, salary_max, experience_years_min, skills, status, created_by, deadline, created_at, updated_at';

// El formulario envía "" para lo que se deja vacío.
const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);
// Al editar, "" significa "borrar el valor": se guarda como null.
const blankToNull = (v: unknown) => (v === '' ? null : v);

const salaryRange = (v: { salary_min?: number | null; salary_max?: number | null }) =>
  v.salary_min == null || v.salary_max == null || v.salary_min <= v.salary_max;
const salaryRangeIssue = { message: 'El salario mínimo no puede superar al máximo', path: ['salary_min'] };

const skillsSchema = z.array(z.string().trim().min(1).max(60)).max(30);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha límite debe ser AAAA-MM-DD');

/**
 * Lo único que acepta la publicación. Nada de `company`, `company_id`, `status` ni
 * `created_by`: la empresa sale del usuario autenticado y una vacante publicada nace
 * `active`. Si el cliente los envía, se descartan (z.object quita lo desconocido).
 */
const createVacancySchema = z
  .object({
    title: z.string().trim().min(2, 'El cargo debe tener al menos 2 caracteres').max(200),
    description: z.preprocess(emptyToUndef, z.string().trim().max(5000).optional()),
    location: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
    modality: z.enum(MODALITIES),
    salary_min: z.preprocess(emptyToUndef, z.number().min(0).max(1_000_000_000).optional()),
    salary_max: z.preprocess(emptyToUndef, z.number().min(0).max(1_000_000_000).optional()),
    experience_years_min: z.preprocess(emptyToUndef, z.number().int().min(0).max(80).optional()),
    skills: skillsSchema.optional(),
    deadline: z.preprocess(emptyToUndef, dateSchema.optional()),
  })
  .refine(salaryRange, salaryRangeIssue);

/** Edición parcial: solo cambia lo que llega. "" borra el campo; `status` pausa/activa/cierra. */
const updateVacancySchema = z
  .object({
    title: z.string().trim().min(2, 'El cargo debe tener al menos 2 caracteres').max(200).optional(),
    description: z.preprocess(blankToNull, z.string().trim().max(5000).nullable().optional()),
    location: z.preprocess(blankToNull, z.string().trim().max(200).nullable().optional()),
    modality: z.enum(MODALITIES).optional(),
    salary_min: z.preprocess(blankToNull, z.number().min(0).max(1_000_000_000).nullable().optional()),
    salary_max: z.preprocess(blankToNull, z.number().min(0).max(1_000_000_000).nullable().optional()),
    experience_years_min: z.preprocess(blankToNull, z.number().int().min(0).max(80).nullable().optional()),
    skills: skillsSchema.optional(),
    deadline: z.preprocess(blankToNull, dateSchema.nullable().optional()),
    status: z.enum(STATUSES).optional(),
  })
  .refine(salaryRange, salaryRangeIssue);

const uuidSchema = z.string().uuid();

/** Los errores de Supabase son objetos planos: se serializan para el log del servidor. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  const e = err as { code?: unknown; message?: unknown } | null;
  return JSON.stringify({ code: e?.code, message: e?.message });
}

/** La base no coincide con el código (columna, tabla o CHECK): hay una migración pendiente. */
function isSchemaDrift(err: unknown): boolean {
  return ['PGRST204', '42703', '42P01', '23514'].includes(String((err as { code?: unknown } | null)?.code));
}

const DRIFT_MESSAGE =
  'Las vacantes no están disponibles por una actualización pendiente de la base de datos. Avisa al administrador.';

function context(req: AuthenticatedRequest) {
  return {
    userId: req.locals?.user?.id,
    companyId: req.locals?.companyId,
    role: req.locals?.profile?.role,
  };
}

/** Responde 403 y devuelve false si el usuario no puede gestionar vacantes de una empresa. */
function authorize(req: AuthenticatedRequest, res: Response, roles: string[] = PUBLISHER_ROLES): boolean {
  const { userId, companyId, role } = context(req);
  if (!userId || !companyId) {
    res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
    return false;
  }
  if (!role || !roles.includes(role)) {
    res.status(403).json({ error: 'No tienes permisos para esta acción sobre las vacantes' });
    return false;
  }
  return true;
}

function fail(req: AuthenticatedRequest, res: Response, label: string, err: unknown): void {
  logger.error(label, { correlationId: getCorrelationId(req), error: describeError(err) });
  if (isSchemaDrift(err)) {
    res.status(503).json({ error: DRIFT_MESSAGE });
    return;
  }
  res.status(500).json({ error: 'Error interno' });
}

/**
 * GET /api/vacancies?status=active&page=1&limit=12 — vacantes de la empresa del usuario.
 * `applicants_count` suma las postulaciones de candidatos con cuenta y los candidatos
 * heredados asociados a la vacante.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!authorize(req, res)) return;
    const { companyId } = context(req);

    const statusParam = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    if (statusParam && !(STATUSES as readonly string[]).includes(statusParam)) {
      res.status(400).json({ error: 'status debe ser: active, paused o closed' });
      return;
    }
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 12, 1), 50);
    const from = (page - 1) * limit;

    let query = supabaseAdmin.from('vacancies').select(VACANCY_COLUMNS, { count: 'exact' }).eq('company_id', companyId);
    if (statusParam) query = query.eq('status', statusParam);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as { id: string }[];
    const ids = rows.map((v) => v.id);
    const applicants = new Map<string, number>();
    if (ids.length > 0) {
      const [apps, legacy] = await Promise.all([
        supabaseAdmin.from('applications').select('vacancy_id').eq('company_id', companyId).in('vacancy_id', ids),
        supabaseAdmin.from('candidates').select('vacancy_id').eq('company_id', companyId).in('vacancy_id', ids),
      ]);
      if (apps.error) throw apps.error;
      if (legacy.error) throw legacy.error;
      for (const r of [...(apps.data ?? []), ...(legacy.data ?? [])]) {
        const id = (r as { vacancy_id: string }).vacancy_id;
        applicants.set(id, (applicants.get(id) ?? 0) + 1);
      }
    }

    const total = count ?? 0;
    res.json({
      items: rows.map((v) => ({ ...v, applicants_count: applicants.get(v.id) ?? 0 })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    fail(req, res, 'Error listando vacantes de la empresa', err);
  }
});

/**
 * POST /api/vacancies — publica una vacante de la empresa del usuario.
 *
 * Roles: empresa y recruiter (un reclutador pertenece a una sola empresa).
 * `company_id` y el nombre de la empresa los pone el servidor a partir de la sesión.
 * La vacante nace `active`: desde ese momento el catálogo de candidatos
 * (GET /api/me/vacancies) la muestra.
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);

  try {
    if (!authorize(req, res)) return;
    const { userId, companyId } = context(req);

    const parsed = createVacancySchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      logger.warn('Vacante: cuerpo inválido', {
        correlationId,
        fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(body)'))],
      });
      res.status(400).json({ error: issue?.message ?? 'Datos de la vacante inválidos' });
      return;
    }
    const v = parsed.data;

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single();
    if (companyError || !company) {
      res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
      return;
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from('vacancies')
      .insert({
        company_id: companyId,
        company: company.name,
        created_by: userId,
        status: 'active',
        title: v.title,
        description: v.description ?? null,
        location: v.location ?? null,
        modality: v.modality,
        salary_min: v.salary_min ?? null,
        salary_max: v.salary_max ?? null,
        experience_years_min: v.experience_years_min ?? 0,
        skills: v.skills ?? [],
        deadline: v.deadline ?? null,
      })
      .select('*')
      .single();
    if (insertError || !created) throw insertError ?? new Error('insert sin resultado');

    logger.info('Vacante publicada', { correlationId, vacancyId: created.id, companyId, userId });
    res.status(201).json(created);
  } catch (err) {
    fail(req, res, 'Error publicando vacante', err);
  }
});

// Cada borrador es una llamada al LLM (coste): tope por IP, aparte del global
const draftLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados borradores seguidos. Intenta en un minuto.' },
});

const draftSchema = z.object({
  text: z.string().trim().min(5, 'Describe la vacante con un poco más de detalle').max(MAX_DRAFT_INPUT),
});

/**
 * POST /api/vacancies/draft — { text } → { draft, notes }
 * Propone una vacante a partir de una descripción informal. NO la guarda: el
 * reclutador revisa, edita y confirma con POST /api/vacancies.
 */
router.post('/draft', draftLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);
  if (!authorize(req, res)) return;

  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Texto inválido' });
    return;
  }

  try {
    const result = await draftVacancy(parsed.data.text);
    logger.info('Borrador de vacante generado', { correlationId, companyId: context(req).companyId, skills: result.draft.skills.length, notes: result.notes.length });
    res.json(result);
  } catch (err) {
    // El formulario sigue disponible: el reclutador puede llenarlo a mano
    logger.warn('Borrador de vacante: el LLM falló', { correlationId, error: describeError(err).slice(0, 300) });
    res.status(502).json({ error: 'No se pudo generar la propuesta en este momento. Puedes llenar el formulario a mano.' });
  }
});

/**
 * GET /api/vacancies/match?role=contador público — vacante ACTIVA de la empresa para
 * ese cargo (misma comparación que los rechazos por puesto), o null. Lo usa el chat
 * para no proponer crear una vacante que ya existe.
 */
router.get('/match', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!authorize(req, res)) return;
    const role = String(req.query.role ?? '').slice(0, 160);
    const stems = searchTerms(role);
    if (stems.length === 0) {
      res.json({ vacancy: null });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('vacancies')
      .select('id, title')
      .eq('company_id', context(req).companyId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const vacancy = (data ?? []).find((v) => sameRole(searchTerms(String(v.title)), stems)) ?? null;
    res.json({ vacancy });
  } catch (err) {
    fail(req, res, 'Error buscando vacante para el cargo', err);
  }
});

/**
 * PATCH /api/vacancies/:id — edita, pausa, activa o cierra una vacante de la empresa.
 * Una vacante de otra empresa da 404. La empresa y el autor no se pueden cambiar.
 */
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!authorize(req, res)) return;
    const { companyId, userId } = context(req);

    if (!uuidSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: 'Id de vacante inválido' });
      return;
    }
    const parsed = updateVacancySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos de la vacante inválidos' });
      return;
    }

    // Solo lo que llegó; company, company_id, created_by e id nunca se escriben desde aquí
    const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    if (Object.keys(changes).length === 0) {
      res.status(400).json({ error: 'No hay nada que actualizar' });
      return;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('vacancies')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('company_id', companyId)
      .select(VACANCY_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      res.status(404).json({ error: 'Vacante no encontrada' });
      return;
    }

    logger.info('Vacante actualizada', {
      correlationId: getCorrelationId(req), vacancyId: req.params.id, companyId, userId, fields: Object.keys(changes),
    });
    res.json(updated);
  } catch (err) {
    fail(req, res, 'Error actualizando vacante', err);
  }
});

/** DELETE /api/vacancies/:id — solo el rol empresa (igual que la política RLS original). */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!authorize(req, res, ['empresa'])) return;
    const { companyId, userId } = context(req);

    if (!uuidSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: 'Id de vacante inválido' });
      return;
    }

    const { data: deleted, error } = await supabaseAdmin
      .from('vacancies')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', companyId)
      .select('id');
    if (error) throw error;
    if (!deleted || deleted.length === 0) {
      res.status(404).json({ error: 'Vacante no encontrada' });
      return;
    }

    logger.info('Vacante eliminada', { correlationId: getCorrelationId(req), vacancyId: req.params.id, companyId, userId });
    res.json({ success: true });
  } catch (err) {
    fail(req, res, 'Error eliminando vacante', err);
  }
});

export default router;
