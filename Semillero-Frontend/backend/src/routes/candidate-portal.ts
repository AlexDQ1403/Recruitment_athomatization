import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest, companyAuthMiddleware } from '../middlewares/companyAuth';
import { requireRole } from '../middlewares/requireRole';

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
  cv_url: z.string().trim().url().max(2048).nullish(),
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

// GET /api/me/applications
router.get('/applications', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.locals!.user!.id;
    const profileId = await getOwnCandidateProfileId(userId);

    if (!profileId) {
      res.status(404).json({ error: 'Ficha de candidato no encontrada' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('applications')
      .select(`
        id, status, created_at,
        vacancy:vacancies!inner(id, title, location, modality, salary_min, salary_max, status),
        company:companies!inner(id, name)
      `)
      .eq('candidate_profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ applications: data ?? [] });
  } catch (err) {
    logger.error('Error listando postulaciones', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
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
    const { error: bridgeError } = await supabaseAdmin.from('company_candidates').upsert(
      {
        company_id: vacancy.company_id,
        candidate_profile_id: profileId,
        status: 'seguimiento',
        source: 'applicant',
      },
      { onConflict: 'company_id,candidate_profile_id', ignoreDuplicates: true }
    );

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

export default router;
