import express, { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest, companyAuthMiddleware } from '../middlewares/companyAuth';
import { requireRole } from '../middlewares/requireRole';
import rateLimit from 'express-rate-limit';
import { cvToText, CvReadError } from '../services/cvText';
import { extractCvDraft } from '../services/cvExtract';
import { COMMON_SKILLS, computeVacancyMatch, MatchCandidate, MatchVacancy, skillsMentioned } from '../services/vacancyMatch';
import { adviseCv } from '../services/cvAdvice';
import { searchExternalJobs, findExternalJob, ExternalJob } from '../services/externalJobs';
import { computeCandidateDashboard, ExternalApp } from '../services/candidateDashboard';
import { MAX_RESUME_BYTES, RESUMES_BUCKET, ResumeError, resumeLink, resumePathOf, uploadResume } from '../services/resumeStorage';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Todo el portal exige sesión y rol 'candidato'
router.use(companyAuthMiddleware, requireRole('candidato'));

// Campos que el candidato puede ver de su propia ficha.
// No incluye nada del proceso interno de las empresas.
const OWN_PROFILE_FIELDS =
  'id, position, professional_title, professional_summary, experience_years, expected_salary, location, phone, cv_url, linkedin_url, visible, created_at, updated_at';

const updateSchema = z.object({
  position: z.string().trim().max(120).nullish(),
  professional_title: z.string().trim().max(160).nullish(),
  professional_summary: z.string().trim().max(2000).nullish(),
  experience_years: z.coerce.number().int().min(0).max(60).nullish(),
  expected_salary: z.coerce.number().min(0).max(1_000_000_000).nullish(),
  location: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(40).nullish(),
  // Solo para quitarla: se sube por POST /api/me/cv (bucket privado)
  cv_url: z.null().optional(),
  linkedin_url: z.string().trim().url().max(2048).nullish(),
  visible: z.boolean().optional(),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const experienceSchema = z.object({
  company_name: z.string().trim().min(1).max(160),
  role_title: z.string().trim().min(1).max(160),
  start_date: z.string().trim().regex(DATE_RE, 'Fecha inválida (YYYY-MM-DD)'),
  end_date: z.string().trim().regex(DATE_RE, 'Fecha inválida (YYYY-MM-DD)').nullish(),
  description: z.string().trim().max(2000).nullish(),
});
const experienceUpdateSchema = experienceSchema.partial();

const educationSchema = z.object({
  institution: z.string().trim().min(1).max(160),
  degree: z.string().trim().min(1).max(160),
  start_date: z.string().trim().regex(DATE_RE, 'Fecha inválida (YYYY-MM-DD)').nullish(),
  end_date: z.string().trim().regex(DATE_RE, 'Fecha inválida (YYYY-MM-DD)').nullish(),
});
const educationUpdateSchema = educationSchema.partial();

const skillSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(['tecnica', 'blanda', 'idioma', 'herramienta']).default('tecnica'),
});

const searchPreferencesSchema = z.object({
  target_position: z.string().trim().max(160).nullish(),
  technologies: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  sectors: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  modality: z.enum(['presencial', 'remoto', 'híbrido']).nullish(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
});

/** Resuelve el candidate_profile del usuario autenticado. */
async function getOwnCandidateProfileId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('candidate_profiles')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

// GET /api/me/profile
router.get('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.locals!.user!.id;

    const { data, error } = await supabaseAdmin
      .from('candidate_profiles')
      .select(OWN_PROFILE_FIELDS)
      .eq('profile_id', userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Ficha de candidato no encontrada' });
      return;
    }

    res.json({
      ...data,
      cv_url: await resumeLink(supabaseAdmin, data.cv_url as string | null),
      full_name: req.locals!.profile!.full_name,
      email: req.locals!.user!.email,
    });
  } catch (err) {
    logger.error('Error obteniendo perfil de candidato', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/me/profile
router.patch('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.locals!.user!.id;

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }

    // Solo las claves presentes en el body; nada de role ni company_id aquí
    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Nada que actualizar' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('candidate_profiles')
      .update(updates)
      .eq('profile_id', userId)
      .select(OWN_PROFILE_FIELDS)
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json(data);
  } catch (err) {
    logger.error('Error actualizando perfil de candidato', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── Experiencia laboral ───────────────────────────────────────────────────

router.get('/experience', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_experience')
    .select('id, company_name, role_title, start_date, end_date, description')
    .eq('candidate_profile_id', profileId)
    .order('start_date', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ experience: data ?? [] });
});

router.post('/experience', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const parsed = experienceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_experience')
    .insert({ ...parsed.data, candidate_profile_id: profileId })
    .select('id, company_name, role_title, start_date, end_date, description')
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch('/experience/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const parsed = experienceUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_experience')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('candidate_profile_id', profileId)
    .select('id, company_name, role_title, start_date, end_date, description')
    .single();

  if (error || !data) { res.status(404).json({ error: 'Registro no encontrado' }); return; }
  res.json(data);
});

router.delete('/experience/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const { error } = await supabaseAdmin
    .from('candidate_experience')
    .delete()
    .eq('id', req.params.id)
    .eq('candidate_profile_id', profileId);

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(204).send();
});

// ─── Formación académica ───────────────────────────────────────────────────

router.get('/education', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_education')
    .select('id, institution, degree, start_date, end_date')
    .eq('candidate_profile_id', profileId)
    .order('start_date', { ascending: false, nullsFirst: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ education: data ?? [] });
});

router.post('/education', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const parsed = educationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_education')
    .insert({ ...parsed.data, candidate_profile_id: profileId })
    .select('id, institution, degree, start_date, end_date')
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch('/education/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const parsed = educationUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_education')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('candidate_profile_id', profileId)
    .select('id, institution, degree, start_date, end_date')
    .single();

  if (error || !data) { res.status(404).json({ error: 'Registro no encontrado' }); return; }
  res.json(data);
});

router.delete('/education/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const { error } = await supabaseAdmin
    .from('candidate_education')
    .delete()
    .eq('id', req.params.id)
    .eq('candidate_profile_id', profileId);

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(204).send();
});

// ─── Habilidades ────────────────────────────────────────────────────────────

router.get('/skills', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_skills')
    .select('id, name, category')
    .eq('candidate_profile_id', profileId)
    .order('category')
    .order('name');

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ skills: data ?? [] });
});

router.post('/skills', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const parsed = skillSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_skills')
    .upsert({ ...parsed.data, candidate_profile_id: profileId }, { onConflict: 'candidate_profile_id,name' })
    .select('id, name, category')
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.delete('/skills/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const { error } = await supabaseAdmin
    .from('candidate_skills')
    .delete()
    .eq('id', req.params.id)
    .eq('candidate_profile_id', profileId);

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(204).send();
});

// ─── Preferencias de búsqueda / matching ───────────────────────────────────
// Separadas a propósito de la hoja de vida (ver migración 020): esto es lo
// que alimenta el chat de reclutadores, no el archivo de CV.

router.get('/search-preferences', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_search_preferences')
    .select('target_position, technologies, sectors, modality, keywords')
    .eq('candidate_profile_id', profileId)
    .maybeSingle();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? { target_position: null, technologies: [], sectors: [], modality: null, keywords: [] });
});

router.patch('/search-preferences', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
  if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

  const parsed = searchPreferencesSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }); return; }

  const { data, error } = await supabaseAdmin
    .from('candidate_search_preferences')
    .upsert({ ...parsed.data, candidate_profile_id: profileId }, { onConflict: 'candidate_profile_id' })
    .select('target_position, technologies, sectors, modality, keywords')
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

// POST /api/me/applications
router.post('/applications', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.locals!.user!.id;
    const { vacancy_id, cover_letter } = req.body as {
      vacancy_id?: string;
      cover_letter?: string;
    };

    if (!vacancy_id) {
      res.status(400).json({ error: 'vacancy_id es requerido' });
      return;
    }
    if (cover_letter && cover_letter.length > 2000) {
      res.status(400).json({ error: 'La carta de presentación no puede exceder 2000 caracteres' });
      return;
    }

    const profileId = await getOwnCandidateProfileId(userId);
    if (!profileId) {
      res.status(404).json({ error: 'Completa tu perfil antes de postularte' });
      return;
    }

    // La vacante debe existir y estar activa; de ella sale la empresa destino
    const { data: vacancy, error: vacancyError } = await supabaseAdmin
      .from('vacancies')
      .select('id, company_id, status')
      .eq('id', vacancy_id)
      .maybeSingle();

    if (vacancyError || !vacancy) {
      res.status(404).json({ error: 'Vacante no encontrada' });
      return;
    }
    if (vacancy.status !== 'active') {
      res.status(400).json({ error: 'Esta vacante ya no acepta postulaciones' });
      return;
    }

    // UNIQUE(candidate_profile_id, vacancy_id) hace el alta idempotente
    const { data: application, error: applicationError } = await supabaseAdmin
      .from('applications')
      .upsert(
        {
          candidate_profile_id: profileId,
          vacancy_id,
          company_id: vacancy.company_id,
          cover_letter: cover_letter ?? null,
        },
        { onConflict: 'candidate_profile_id,vacancy_id', ignoreDuplicates: false }
      )
      .select('id, status, created_at')
      .single();

    if (applicationError) {
      res.status(400).json({ error: applicationError.message });
      return;
    }

    // Postularse incorpora al candidato al pool de esa empresa
    // Sin upsert: el índice único (company_id, candidate_profile_id) es PARCIAL y PostgREST
    // responde 42P10, con lo que el candidato nunca entraba al pool de la empresa.
    let bridgeError: { message?: string; code?: string } | null = null;
    const { data: existingBridge, error: bridgeLookupError } = await supabaseAdmin
      .from('company_candidates')
      .select('id')
      .eq('company_id', vacancy.company_id)
      .eq('candidate_profile_id', profileId)
      .maybeSingle();
    bridgeError = bridgeLookupError;
    if (!bridgeError && !existingBridge) {
      const { error: insertError } = await supabaseAdmin.from('company_candidates').insert({
        company_id: vacancy.company_id,
        candidate_profile_id: profileId,
        status: 'seguimiento',
        source: 'applicant',
      });
      // 23505: otra petición lo creó entre la consulta y el insert; no es un error
      if (insertError && insertError.code !== '23505') bridgeError = insertError;
    }

    if (bridgeError) {
      // La postulación ya existe: no se revierte, solo se registra
      logger.error('Error creando relación empresa-candidato', {
        error: bridgeError.message,
        companyId: vacancy.company_id,
        profileId,
      });
    }

    logger.info('Postulación creada', { profileId, vacancyId: vacancy_id });
    res.status(201).json(application);
  } catch (err) {
    logger.error('Error creando postulación', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/me/vacancies — catálogo de vacantes activas
router.get('/vacancies', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { data, error, count } = await supabaseAdmin
      .from('vacancies')
      .select(
        'id, title, description, location, modality, salary_min, salary_max, experience_years_min, skills, deadline, company:companies!inner(id, name)',
        { count: 'exact' }
      )
      .eq('status', 'active')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ vacancies: data ?? [], total: count ?? 0, limit, offset });
  } catch (err) {
    logger.error('Error listando vacantes', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── Hoja de vida, recomendaciones y postulaciones ─────────────────────────

// Cada llamada a la IA cuesta: por candidato, no por IP
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).locals?.user?.id ?? req.ip ?? 'anon',
  message: { error: 'Has usado mucho la IA en la última hora. Inténtalo de nuevo más tarde.' },
});

const VACANCY_FIELDS = 'id, title, description, location, modality, salary_min, salary_max, experience_years_min, skills, deadline, status, created_at, company:companies!inner(id, name)';
const MAX_VACANCIES = 200;
const isMissingColumn = (e: { code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204');

type VacancyRow = MatchVacancy & { id: string; status: string; created_at: string; deadline: string | null; company: { id: string; name: string } | { id: string; name: string }[] };
const companyOf = (v: VacancyRow) => (Array.isArray(v.company) ? v.company[0] : v.company);

/** Todo lo del perfil que sirve para comparar con una vacante. */
async function loadMatchCandidate(profileId: string): Promise<MatchCandidate & { has_cv: boolean }> {
  const [p, exp, edu, skills, prefs] = await Promise.all([
    supabaseAdmin.from('candidate_profiles')
      .select('position, professional_title, professional_summary, experience_years, expected_salary, location, cv_url')
      .eq('id', profileId).maybeSingle(),
    supabaseAdmin.from('candidate_experience').select('role_title, description').eq('candidate_profile_id', profileId),
    supabaseAdmin.from('candidate_education').select('degree').eq('candidate_profile_id', profileId),
    supabaseAdmin.from('candidate_skills').select('name').eq('candidate_profile_id', profileId),
    supabaseAdmin.from('candidate_search_preferences').select('target_position, technologies, keywords, modality').eq('candidate_profile_id', profileId).maybeSingle(),
  ]);
  for (const r of [p, exp, edu, skills]) if (r.error) throw r.error;
  const prof = (p.data ?? {}) as Record<string, unknown>;
  const pref = (prefs.data ?? {}) as { target_position?: string | null; technologies?: string[] | null; keywords?: string[] | null; modality?: string | null };
  return {
    position: prof.position as string | null,
    professional_title: prof.professional_title as string | null,
    professional_summary: prof.professional_summary as string | null,
    experience_years: prof.experience_years as number | null,
    expected_salary: prof.expected_salary as number | null,
    location: prof.location as string | null,
    has_cv: !!prof.cv_url,
    skills: [...(skills.data ?? []).map((s) => s.name as string), ...(pref.technologies ?? [])],
    experience: (exp.data ?? []) as { role_title: string; description: string | null }[],
    education: (edu.data ?? []) as { degree: string }[],
    target_position: pref.target_position ?? null,
    keywords: pref.keywords ?? [],
    modality: pref.modality ?? null,
  };
}

/** Qué le falta al perfil para que el porcentaje sea confiable. */
function profileStrength(c: MatchCandidate & { has_cv: boolean }) {
  const checks: [string, boolean][] = [
    ['Cargo o titular profesional', !!(c.position || c.professional_title || c.target_position)],
    ['Habilidades', c.skills.length > 0],
    ['Experiencia laboral', c.experience.length > 0],
    ['Años de experiencia', c.experience_years != null],
    ['Ciudad', !!c.location],
    ['Formación', c.education.length > 0],
  ];
  return { filled: checks.filter(([, ok]) => ok).length, total: checks.length, missing: checks.filter(([, ok]) => !ok).map(([label]) => label) };
}

// POST /api/me/cv — sube la HV (cuerpo binario). El backend valida el tipo por sus bytes.
router.post('/cv', express.raw({ type: () => true, limit: MAX_RESUME_BYTES + 1024 }), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.locals!.user!.id;
  try {
    const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
    if (bytes.byteLength === 0) {
      res.status(400).json({ error: 'No llegó ningún archivo' });
      return;
    }
    const { data: prof } = await supabaseAdmin.from('candidate_profiles').select('id, cv_url').eq('profile_id', userId).maybeSingle();
    if (!prof) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

    const cvUrl = await uploadResume(supabaseAdmin, userId, bytes);
    const { error } = await supabaseAdmin.from('candidate_profiles').update({ cv_url: cvUrl }).eq('id', prof.id);
    if (error) throw error;

    // La versión anterior ya no se usa: no se guardan copias viejas de datos personales
    const old = resumePathOf(prof.cv_url as string | null);
    if (old && old.startsWith(`${userId}/`)) await supabaseAdmin.storage.from(RESUMES_BUCKET).remove([old]);

    logger.info('HV subida', { userId });
    res.status(201).json({ cv_url: await resumeLink(supabaseAdmin, cvUrl) });
  } catch (err) {
    if (err instanceof ResumeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error('Error subiendo la HV', { userId, error: err instanceof Error ? err.message : JSON.stringify(err) });
    res.status(500).json({ error: 'No pudimos guardar tu hoja de vida. Inténtalo de nuevo.' });
  }
});

// DELETE /api/me/cv — quita la HV del perfil y borra el archivo
router.delete('/cv', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.locals!.user!.id;
  try {
    const { data: prof } = await supabaseAdmin.from('candidate_profiles').select('id, cv_url').eq('profile_id', userId).maybeSingle();
    if (!prof) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const { error } = await supabaseAdmin.from('candidate_profiles').update({ cv_url: null }).eq('id', prof.id);
    if (error) throw error;
    const path = resumePathOf(prof.cv_url as string | null);
    if (path && path.startsWith(`${userId}/`)) await supabaseAdmin.storage.from(RESUMES_BUCKET).remove([path]);
    res.status(204).end();
  } catch (err) {
    logger.error('Error eliminando la HV', { userId, error: err instanceof Error ? err.message : JSON.stringify(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/me/cv/extract — lee la HV subida y devuelve un borrador del perfil (no guarda nada)
router.post('/cv/extract', aiLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.locals!.user!.id;
  try {
    const { data: prof } = await supabaseAdmin.from('candidate_profiles').select('cv_url').eq('profile_id', userId).maybeSingle();
    const url = prof?.cv_url as string | undefined;
    if (!url) {
      res.status(400).json({ error: 'Primero sube tu hoja de vida' });
      return;
    }
    // Solo se lee si está en la carpeta del propio usuario
    const path = resumePathOf(url) ?? '';
    if (!path.startsWith(`${userId}/`) || path.includes('..')) {
      res.status(403).json({ error: 'No podemos leer ese archivo. Vuelve a subir tu hoja de vida.' });
      return;
    }
    const { data: file, error: dlError } = await supabaseAdmin.storage.from(RESUMES_BUCKET).download(path);
    if (dlError || !file) {
      res.status(404).json({ error: 'No encontramos tu hoja de vida. Vuelve a subirla.' });
      return;
    }
    const text = await cvToText(new Uint8Array(await file.arrayBuffer()), (path.split('.').pop() ?? '').toLowerCase());
    const draft = await extractCvDraft(text);
    logger.info('HV leída con IA', { userId, experience: draft.experience.length, skills: draft.skills.length });
    res.json({ draft });
  } catch (err) {
    if (err instanceof CvReadError) {
      res.status(422).json({ error: err.message });
      return;
    }
    logger.error('Error leyendo la HV', { userId, error: String(err) });
    res.status(502).json({ error: 'No pudimos leer tu hoja de vida en este momento. Inténtalo de nuevo en unos minutos.' });
  }
});

// GET /api/me/recommendations — vacantes abiertas ordenadas por ajuste al perfil
router.get('/recommendations', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

    const [candidate, vacRes, appRes] = await Promise.all([
      loadMatchCandidate(profileId),
      supabaseAdmin.from('vacancies').select(VACANCY_FIELDS).eq('status', 'active').order('created_at', { ascending: false }).range(0, MAX_VACANCIES - 1),
      supabaseAdmin.from('applications').select('vacancy_id').eq('candidate_profile_id', profileId),
    ]);
    if (vacRes.error) throw vacRes.error;
    const applied = new Set((appRes.data ?? []).map((a) => a.vacancy_id as string));

    const vacancies = ((vacRes.data ?? []) as unknown as VacancyRow[])
      .map((v) => ({
        id: v.id, title: v.title, description: v.description, location: v.location, modality: v.modality,
        salary_min: v.salary_min, salary_max: v.salary_max, experience_years_min: v.experience_years_min,
        skills: v.skills ?? [], deadline: v.deadline, created_at: v.created_at, company: companyOf(v),
        applied: applied.has(v.id),
        match: computeVacancyMatch(candidate, v),
      }))
      .sort((a, b) => b.match.score - a.match.score || b.created_at.localeCompare(a.created_at));

    res.json({ profile_strength: profileStrength(candidate), has_cv: candidate.has_cv, vacancies });
  } catch (err) {
    logger.error('Error calculando recomendaciones', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/me/vacancies/:id/advice — cómo ajustar la HV a esta vacante
router.post('/vacancies/:id/advice', aiLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    res.status(400).json({ error: 'Vacante inválida' });
    return;
  }
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

    const [{ data: vacancy }, { data: application }] = await Promise.all([
      supabaseAdmin.from('vacancies').select(VACANCY_FIELDS).eq('id', req.params.id).maybeSingle(),
      supabaseAdmin.from('applications').select('id').eq('candidate_profile_id', profileId).eq('vacancy_id', req.params.id).maybeSingle(),
    ]);
    // Solo vacantes abiertas, o cerradas a las que ya se postuló (para revisar su consejo)
    if (!vacancy || (vacancy.status !== 'active' && !application)) {
      res.status(404).json({ error: 'Vacante no encontrada' });
      return;
    }
    const candidate = await loadMatchCandidate(profileId);
    const match = computeVacancyMatch(candidate, vacancy as unknown as VacancyRow);
    const advice = await adviseCv(candidate, vacancy as unknown as VacancyRow, match);
    res.json({ match, advice, profile_strength: profileStrength(candidate) });
  } catch (err) {
    logger.error('Error generando consejos de HV', { vacancyId: req.params.id, error: String(err) });
    res.status(502).json({ error: 'No pudimos generar los consejos en este momento. Inténtalo de nuevo.' });
  }
});

/**
 * Etapa de la postulación contada al candidato, de lo más avanzado a lo menos.
 * La decisión de la empresa se guarda por empresa (company_candidates), no por vacante.
 */
type Stage = 'enviada' | 'en_revision' | 'contactado' | 'preseleccionado' | 'siguiente_fase' | 'no_continua';
function stageOf(appStatus: string, bridge?: { presented_to_company: boolean | null; company_decision: string | null }): Stage {
  if (appStatus === 'descartada' || bridge?.company_decision === 'descartado') return 'no_continua';
  if (bridge?.company_decision === 'contratado') return 'siguiente_fase';
  if (bridge?.presented_to_company) return 'preseleccionado';
  if (appStatus === 'contactado') return 'contactado';
  if (appStatus === 'en_revision') return 'en_revision';
  return 'enviada';
}

/** Postulaciones a vacantes de la plataforma, con su etapa, ajuste y nota propia. */
async function loadOwnApplications(profileId: string, candidate: MatchCandidate) {
  // Nota propia (migración 029): si aún no existe la columna, se lista sin ella
  const query = (withNote: boolean) => supabaseAdmin
    .from('applications')
    .select(`id, status, created_at, updated_at, cover_letter${withNote ? ', candidate_note' : ''}, vacancy:vacancies!inner(${VACANCY_FIELDS.replace(', company:companies!inner(id, name)', '')}), company:companies!inner(id, name)`)
    .eq('candidate_profile_id', profileId)
    .order('created_at', { ascending: false });
  let appsRes = await query(true);
  let notesEnabled = true;
  if (isMissingColumn(appsRes.error)) {
    logger.warn('Postulaciones sin nota del candidato (¿migración 029?)', { error: appsRes.error?.message });
    appsRes = await query(false);
    notesEnabled = false;
  }
  if (appsRes.error) throw appsRes.error;

  const { data: bridgeRows } = await supabaseAdmin
    .from('company_candidates').select('company_id, presented_to_company, company_decision').eq('candidate_profile_id', profileId);
  const bridges = new Map((bridgeRows ?? []).map((b) => [b.company_id as string, b as { presented_to_company: boolean | null; company_decision: string | null }]));

  const applications = ((appsRes.data ?? []) as unknown as Record<string, unknown>[]).map((a) => {
    const vacancy = (Array.isArray(a.vacancy) ? a.vacancy[0] : a.vacancy) as VacancyRow;
    const company = (Array.isArray(a.company) ? a.company[0] : a.company) as { id: string; name: string };
    return {
      id: a.id as string, status: a.status as string, created_at: a.created_at as string, updated_at: a.updated_at as string,
      cover_letter: (a.cover_letter as string | null) ?? null,
      note: notesEnabled ? (a.candidate_note as string | null) ?? null : null,
      stage: stageOf(a.status as string, bridges.get(company.id)),
      vacancy: {
        id: vacancy.id, title: vacancy.title, location: vacancy.location, modality: vacancy.modality,
        salary_min: vacancy.salary_min, salary_max: vacancy.salary_max, status: vacancy.status, deadline: vacancy.deadline,
      },
      company,
      match: computeVacancyMatch(candidate, vacancy),
    };
  });
  return { applications, notesEnabled };
}

// GET /api/me/applications — postulaciones con su etapa, ajuste y nota propia
router.get('/applications', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const { applications, notesEnabled } = await loadOwnApplications(profileId, await loadMatchCandidate(profileId));
    res.json({ applications, notes_enabled: notesEnabled });
  } catch (err) {
    logger.error('Error listando postulaciones', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/me/applications/:id — nota privada del candidato
router.patch('/applications/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = z.object({ note: z.string().trim().max(1000).nullable() }).safeParse(req.body);
  if (!z.string().uuid().safeParse(req.params.id).success || !parsed.success) {
    res.status(400).json({ error: 'La nota puede tener hasta 1000 caracteres' });
    return;
  }
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const { data, error } = await supabaseAdmin
      .from('applications')
      .update({ candidate_note: parsed.data.note || null })
      .eq('id', req.params.id)
      .eq('candidate_profile_id', profileId)
      .select('id, candidate_note')
      .maybeSingle();
    if (isMissingColumn(error)) {
      res.status(503).json({ error: 'Las notas estarán disponibles cuando se aplique una actualización pendiente de la base de datos.' });
      return;
    }
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Postulación no encontrada' }); return; }
    res.json({ id: data.id, note: data.candidate_note });
  } catch (err) {
    logger.error('Error guardando la nota de la postulación', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── Ofertas de otros sitios web ───────────────────────────────────────────

const isMissingTable = (e: { code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205');
const EXTERNAL_TABLE_PENDING = 'El registro de postulaciones externas estará disponible cuando se aplique una actualización pendiente de la base de datos.';
const EXTERNAL_FIELDS = 'id, source, title, company, location, url, status, match_score, note, applied_at, status_changed_at';
const MAX_EXTERNAL_SHOWN = 40;
const MIN_EXTERNAL_MATCH = 20;

/**
 * Vocabulario de habilidades para leer ofertas externas: las del candidato, las
 * que piden las vacantes de la plataforma y unas comunes. Con él se detecta en
 * la descripción qué pide la oferta (y así qué tiene y qué le falta al candidato).
 */
async function skillVocabulary(c: MatchCandidate): Promise<string[]> {
  const { data } = await supabaseAdmin.from('vacancies').select('skills').eq('status', 'active').range(0, MAX_VACANCIES - 1);
  return [...c.skills, ...(data ?? []).flatMap((v) => (v.skills as string[] | null) ?? []), ...COMMON_SKILLS];
}

const asMatchVacancy = (j: ExternalJob, vocabulary: string[]): MatchVacancy => ({
  title: j.title, description: j.description, location: j.remote ? null : j.location, modality: j.remote ? 'remoto' : null,
  skills: skillsMentioned(vocabulary, `${j.title}
${j.description}`),
});

/** Lo que el candidato busca, en pocas palabras, para consultar los portales. */
const searchQueryOf = (c: MatchCandidate) =>
  (c.target_position || c.position || c.professional_title || c.experience[0]?.role_title || '').split(/[|,·(]/)[0].trim().slice(0, 80);

// GET /api/me/external-jobs?q= — ofertas de otros portales, ordenadas por ajuste
router.get('/external-jobs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const candidate = await loadMatchCandidate(profileId);
    const custom = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const query = custom || searchQueryOf(candidate);
    if (!query) {
      res.json({ query: null, sources: [], jobs: [], google_enabled: !!config.SERPAPI_API_KEY });
      return;
    }

    const [search, appliedRes, vocabulary] = await Promise.all([
      searchExternalJobs(query, candidate.location ?? null, {
        serpApiKey: config.SERPAPI_API_KEY,
        onError: (source, err) => logger.warn('Ofertas externas: una fuente falló', { source, error: err instanceof Error ? err.message : String(err) }),
      }),
      supabaseAdmin.from('external_applications').select('url').eq('candidate_profile_id', profileId),
      skillVocabulary(candidate),
    ]);
    const applied = new Set(isMissingTable(appliedRes.error) ? [] : (appliedRes.data ?? []).map((a) => a.url as string));

    const jobs = search.jobs
      .map((j) => ({ ...j, applied: applied.has(j.url), match: computeVacancyMatch(candidate, asMatchVacancy(j, vocabulary)) }))
      // Con una búsqueda propia se muestra todo lo que trajo; con la del perfil, solo lo afín
      .filter((j) => custom || j.match.score >= MIN_EXTERNAL_MATCH)
      .sort((a, b) => b.match.score - a.match.score || String(b.published_at ?? '').localeCompare(String(a.published_at ?? '')))
      .slice(0, MAX_EXTERNAL_SHOWN);

    res.json({ query, sources: search.sources, jobs, google_enabled: !!config.SERPAPI_API_KEY });
  } catch (err) {
    logger.error('Error buscando ofertas externas', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/me/external-jobs/:id/advice — consejos de HV para una oferta externa vista hace poco
router.post('/external-jobs/:id/advice', aiLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const job = findExternalJob(String(req.params.id));
  if (!job) {
    res.status(404).json({ error: 'Esa oferta ya no está en memoria. Vuelve a cargar las ofertas de otros sitios.' });
    return;
  }
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const candidate = await loadMatchCandidate(profileId);
    const vacancy = asMatchVacancy(job, await skillVocabulary(candidate));
    const match = computeVacancyMatch(candidate, vacancy);
    const advice = await adviseCv(candidate, vacancy, match);
    res.json({ match, advice, profile_strength: profileStrength(candidate) });
  } catch (err) {
    logger.error('Error generando consejos de HV (oferta externa)', { jobId: job.id, error: String(err) });
    res.status(502).json({ error: 'No pudimos generar los consejos en este momento. Inténtalo de nuevo.' });
  }
});

const externalCreateSchema = z.union([
  // Desde una oferta que le mostramos: los datos salen del servidor, no del navegador
  z.object({ job_id: z.string().min(1).max(80) }),
  // Una postulación que hizo por su cuenta en otro sitio
  z.object({
    title: z.string().trim().min(1).max(200),
    company: z.string().trim().max(200).nullish(),
    url: z.string().trim().url().max(2048).refine((u) => /^https?:\/\//i.test(u), 'URL inválida'),
    location: z.string().trim().max(200).nullish(),
    source: z.string().trim().max(40).nullish(),
  }),
]);
const EXTERNAL_STATUS = ['postulado', 'en_proceso', 'entrevista', 'oferta', 'no_seleccionado'] as const;

// GET /api/me/external-applications
router.get('/external-applications', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const { data, error } = await supabaseAdmin.from('external_applications').select(EXTERNAL_FIELDS)
      .eq('candidate_profile_id', profileId).order('applied_at', { ascending: false });
    if (isMissingTable(error)) {
      res.json({ applications: [], enabled: false });
      return;
    }
    if (error) throw error;
    res.json({ applications: data ?? [], enabled: true });
  } catch (err) {
    logger.error('Error listando postulaciones externas', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/me/external-applications — "sí, me postulé en ese sitio"
router.post('/external-applications', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = externalCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos de la postulación inválidos' });
    return;
  }
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }

    let row: { source: string; title: string; company: string | null; location: string | null; url: string; match_score: number | null };
    if ('job_id' in parsed.data) {
      const job = findExternalJob(parsed.data.job_id);
      if (!job) {
        res.status(404).json({ error: 'Esa oferta ya no está en memoria. Vuelve a cargar las ofertas de otros sitios.' });
        return;
      }
      const candidate = await loadMatchCandidate(profileId);
      const match = computeVacancyMatch(candidate, asMatchVacancy(job, await skillVocabulary(candidate)));
      row = { source: job.source_label, title: job.title, company: job.company, location: job.location, url: job.url, match_score: match.score };
    } else {
      const d = parsed.data;
      row = { source: d.source || 'Otro sitio', title: d.title, company: d.company ?? null, location: d.location ?? null, url: d.url, match_score: null };
    }

    // UNIQUE(candidate_profile_id, url): confirmar dos veces no duplica
    const { data, error } = await supabaseAdmin.from('external_applications')
      .upsert({ candidate_profile_id: profileId, ...row }, { onConflict: 'candidate_profile_id,url', ignoreDuplicates: false })
      .select(EXTERNAL_FIELDS).single();
    if (isMissingTable(error)) { res.status(503).json({ error: EXTERNAL_TABLE_PENDING }); return; }
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error('Error registrando postulación externa', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/me/external-applications/:id — el candidato actualiza el estado o su nota
router.patch('/external-applications/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    status: z.enum(EXTERNAL_STATUS).optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  }).safeParse(req.body);
  if (!z.string().uuid().safeParse(req.params.id).success || !parsed.success) {
    res.status(400).json({ error: 'Datos inválidos' });
    return;
  }
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const { data: current, error: readError } = await supabaseAdmin.from('external_applications').select('status')
      .eq('id', req.params.id).eq('candidate_profile_id', profileId).maybeSingle();
    if (isMissingTable(readError)) { res.status(503).json({ error: EXTERNAL_TABLE_PENDING }); return; }
    if (readError) throw readError;
    if (!current) { res.status(404).json({ error: 'Postulación no encontrada' }); return; }

    const update: Record<string, unknown> = {};
    if (parsed.data.status && parsed.data.status !== current.status) {
      update.status = parsed.data.status;
      update.status_changed_at = new Date().toISOString();
    }
    if (parsed.data.note !== undefined) update.note = parsed.data.note || null;
    if (Object.keys(update).length === 0) { res.json(current); return; }

    const { data, error } = await supabaseAdmin.from('external_applications').update(update)
      .eq('id', req.params.id).eq('candidate_profile_id', profileId).select(EXTERNAL_FIELDS).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('Error actualizando postulación externa', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/me/external-applications/:id
router.delete('/external-applications/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!z.string().uuid().safeParse(req.params.id).success) { res.status(400).json({ error: 'Id inválido' }); return; }
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const { error } = await supabaseAdmin.from('external_applications').delete()
      .eq('id', req.params.id).eq('candidate_profile_id', profileId);
    if (isMissingTable(error)) { res.status(503).json({ error: EXTERNAL_TABLE_PENDING }); return; }
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    logger.error('Error eliminando postulación externa', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── Tablero "Mi búsqueda" ─────────────────────────────────────────────────

// GET /api/me/dashboard
router.get('/dashboard', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const profileId = await getOwnCandidateProfileId(req.locals!.user!.id);
    if (!profileId) { res.status(404).json({ error: 'Ficha de candidato no encontrada' }); return; }
    const candidate = await loadMatchCandidate(profileId);
    const [{ applications }, externalRes, profRes] = await Promise.all([
      loadOwnApplications(profileId, candidate),
      supabaseAdmin.from('external_applications').select(EXTERNAL_FIELDS).eq('candidate_profile_id', profileId),
      supabaseAdmin.from('candidate_profiles').select('created_at').eq('id', profileId).maybeSingle(),
    ]);
    const externalEnabled = !isMissingTable(externalRes.error);
    if (externalRes.error && externalEnabled) throw externalRes.error;

    const dashboard = computeCandidateDashboard({
      internal: applications.map((a) => ({
        id: a.id, title: a.vacancy.title, company: a.company.name, stage: a.stage,
        created_at: a.created_at, updated_at: a.updated_at, match: a.match.score,
      })),
      external: externalEnabled ? (externalRes.data ?? []) as unknown as ExternalApp[] : [],
      profile_created_at: (profRes.data?.created_at as string | undefined) ?? null,
      now: new Date(),
    });
    res.json({ ...dashboard, external_enabled: externalEnabled, profile_strength: profileStrength(candidate), has_cv: candidate.has_cv });
  } catch (err) {
    logger.error('Error armando el tablero del candidato', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
