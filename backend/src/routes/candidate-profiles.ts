import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { resumeLink } from '../services/resumeStorage';
import { getCorrelationId } from '../utils/tracing';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { normalizePhone } from '../services/contact';
import { REJECTION_COLUMNS, roleKey, toRejection, type Rejection } from '../services/rejections';

/**
 * Perfil completo de un candidato y registro de contacto, para el reclutador.
 *
 * El chat solo guarda una captura sin datos de contacto (chatCandidate.ts). Este
 * router es el único punto donde salen email y teléfono hacia el reclutador:
 * siempre filtrado por la empresa del token y dejando traza en el log.
 *
 *   GET  /api/candidate-profiles/:kind/:id          perfil + contacto + último contacto
 *   POST /api/candidate-profiles/:kind/:id/contact  registra que se le escribió
 *
 * :kind = 'legacy' (tabla candidates: scraping o alta manual), 'profile' (cuenta
 * propia) o 'auto' (mensajes del chat anteriores a `kind`: prueba ambos).
 */
const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const paramsSchema = z.object({
  kind: z.enum(['legacy', 'profile', 'auto']),
  id: z.string().uuid(),
});

const contactSchema = z.object({
  channel: z.enum(['whatsapp', 'email', 'linkedin']),
});

// Rechazo por puesto: el cargo (de la búsqueda, editable) y/o una vacante de la empresa
const rejectionSchema = z.object({
  role: z.string().trim().max(160).optional(),
  vacancy_id: z.string().uuid().optional(),
  reason: z.string().trim().max(500).optional(),
}).refine((b) => !!b.role || !!b.vacancy_id, { message: 'Indica el puesto o la vacante' });

type Kind = 'legacy' | 'profile';

export interface CandidateProfileDetail {
  kind: Kind;
  id: string;
  full_name: string;
  position: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  experience_years: number | null;
  expected_salary: number | null;
  source: string;
  status: string;
  resume_url: string | null;
  profile_url: string | null;
  contact: { email: string | null; phone: string | null; linkedin_url: string | null };
  experience: { company_name: string; role_title: string; start_date: string; end_date: string | null; description: string | null }[];
  education: { institution: string; degree: string; start_date: string | null; end_date: string | null }[];
  skills: { name: string; category: string }[];
  last_contact: { channel: string; created_at: string } | null;
  /** Puestos para los que se rechazó (no excluye de otros puestos). */
  rejections: Rejection[];
  /** Para armar el mensaje personalizado en el cliente. */
  sender: { recruiter_name: string | null; company_name: string | null };
  /** Presentación a la empresa: quién, cuándo, para qué vacante y qué decidió la empresa. */
  presentation: {
    presented: boolean; presented_at: string | null; presented_by: string | null;
    vacancy_title: string | null; company_decision: string | null; decision_reason: string | null;
  } | null;
}

type Base = Omit<CandidateProfileDetail, 'last_contact' | 'sender' | 'rejections' | 'presentation'>;

async function loadLegacy(companyId: string, id: string): Promise<Base | null> {
  const { data: c, error } = await supabaseAdmin
    .from('candidates')
    .select('id, full_name, position, headline, summary, email, phone, location, experience_years, expected_salary, source, status, resume_url, profile_url, linkedin_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  return {
    kind: 'legacy',
    id: c.id,
    full_name: c.full_name,
    position: c.position || null,
    headline: c.headline ?? null,
    summary: c.summary ?? null,
    location: c.location ?? null,
    experience_years: c.experience_years ?? null,
    expected_salary: c.expected_salary ?? null,
    source: c.source,
    status: c.status,
    resume_url: c.resume_url ?? null,
    profile_url: c.profile_url ?? null,
    contact: { email: c.email ?? null, phone: normalizePhone(c.phone), linkedin_url: c.linkedin_url ?? null },
    experience: [],
    education: [],
    skills: [],
  };
}

async function loadProfile(companyId: string, id: string): Promise<Base | null> {
  // Solo candidatos relacionados con la empresa (postulación o puente) y visibles
  const { data: bridge, error: bridgeError } = await supabaseAdmin
    .from('company_candidates')
    .select('status, source')
    .eq('company_id', companyId)
    .eq('candidate_profile_id', id)
    .maybeSingle();
  if (bridgeError) throw bridgeError;
  if (!bridge) return null;

  const [profileRes, experienceRes, educationRes, skillsRes] = await Promise.all([
    supabaseAdmin
      .from('candidate_profiles')
      .select('id, position, professional_title, professional_summary, experience_years, expected_salary, location, phone, cv_url, linkedin_url, visible, profiles:profile_id(full_name, email)')
      .eq('id', id)
      .maybeSingle(),
    supabaseAdmin
      .from('candidate_experience')
      .select('company_name, role_title, start_date, end_date, description')
      .eq('candidate_profile_id', id)
      .order('start_date', { ascending: false }),
    supabaseAdmin
      .from('candidate_education')
      .select('institution, degree, start_date, end_date')
      .eq('candidate_profile_id', id)
      .order('start_date', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('candidate_skills')
      .select('name, category')
      .eq('candidate_profile_id', id)
      .order('name'),
  ]);
  if (profileRes.error) throw profileRes.error;
  const p = profileRes.data;
  if (!p || p.visible === false) return null;

  const account = (p.profiles as { full_name?: string; email?: string } | null) ?? {};
  return {
    kind: 'profile',
    id: p.id as string,
    full_name: account.full_name ?? 'Candidato',
    position: (p.position as string) ?? null,
    headline: (p.professional_title as string) ?? null,
    summary: (p.professional_summary as string) ?? null,
    location: (p.location as string) ?? null,
    experience_years: (p.experience_years as number) ?? null,
    expected_salary: (p.expected_salary as number) ?? null,
    source: (bridge.source as string) ?? 'applicant',
    status: (bridge.status as string) ?? 'seguimiento',
    // Bucket privado: enlace firmado que vence (services/resumeStorage.ts)
    resume_url: await resumeLink(supabaseAdmin, p.cv_url as string | null),
    profile_url: null,
    contact: {
      email: account.email ?? null,
      phone: normalizePhone(p.phone as string | null),
      linkedin_url: (p.linkedin_url as string) ?? null,
    },
    experience: (experienceRes.data ?? []) as Base['experience'],
    education: (educationRes.data ?? []) as Base['education'],
    skills: (skillsRes.data ?? []) as Base['skills'],
  };
}

async function loadCandidate(companyId: string, kind: Kind | 'auto', id: string): Promise<Base | null> {
  if (kind === 'legacy') return loadLegacy(companyId, id);
  if (kind === 'profile') return loadProfile(companyId, id);
  return (await loadLegacy(companyId, id)) ?? loadProfile(companyId, id);
}

/** Contactar y rechazar son del reclutador; la empresa solo consulta perfiles. */
function recruiterOnly(req: AuthenticatedRequest, res: Response): boolean {
  if (req.locals?.profile?.role === 'recruiter') return true;
  res.status(403).json({ error: 'Solo un reclutador puede hacer esto' });
  return false;
}

/** Presentación a la empresa (company_candidates): quién, cuándo, vacante y decisión. */
async function loadPresentation(companyId: string, candidate: Base): Promise<CandidateProfileDetail['presentation']> {
  const query = (columns: string) => supabaseAdmin
    .from('company_candidates')
    .select(columns)
    .eq('company_id', companyId)
    .eq(candidate.kind === 'legacy' ? 'legacy_candidate_id' : 'candidate_profile_id', candidate.id)
    .maybeSingle();
  const base = 'presented_to_company, presented_at, presented_by, company_decision';
  let { data, error } = await query(`${base}, company_decision_reason`);
  // Sin la migración 028 (motivo de la decisión) se lee igual, sin el motivo
  if (error) ({ data, error } = await query(base));
  const bridge = data as {
    presented_to_company: boolean | null; presented_at: string | null; presented_by: string | null;
    company_decision: string | null; company_decision_reason?: string | null;
  } | null;
  if (!bridge) return null;

  // Sin embebidos (vacancies:vacancy_id(...)): la relación no está declarada y PostgREST devuelve null
  const [byRes, linkRes] = await Promise.all([
    bridge.presented_by
      ? supabaseAdmin.from('profiles').select('full_name').eq('id', bridge.presented_by).eq('company_id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    candidate.kind === 'legacy'
      ? supabaseAdmin.from('candidates').select('vacancy_id').eq('id', candidate.id).maybeSingle()
      : supabaseAdmin.from('applications').select('vacancy_id').eq('candidate_profile_id', candidate.id).eq('company_id', companyId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const vacancyId = (linkRes.data as { vacancy_id?: string | null } | null)?.vacancy_id ?? null;
  const vacancyRes = vacancyId
    ? await supabaseAdmin.from('vacancies').select('title').eq('id', vacancyId).eq('company_id', companyId).maybeSingle()
    : { data: null };
  return {
    presented: bridge.presented_to_company === true,
    presented_at: bridge.presented_at ?? null,
    presented_by: (byRes.data as { full_name?: string } | null)?.full_name ?? null,
    vacancy_title: (vacancyRes.data as { title?: string } | null)?.title ?? null,
    company_decision: bridge.company_decision ?? null,
    decision_reason: bridge.company_decision_reason ?? null,
  };
}

const originColumn = (kind: Kind) => (kind === 'legacy' ? 'legacy_candidate_id' : 'candidate_profile_id');

router.get('/:kind/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);
  try {
    const companyId = req.locals?.companyId;
    const userId = req.locals?.user?.id;
    if (!companyId || !userId) {
      res.status(403).json({ error: 'Usuario sin empresa asignada' });
      return;
    }
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: 'Parámetros inválidos' });
      return;
    }

    const candidate = await loadCandidate(companyId, params.data.kind, params.data.id);
    if (!candidate) {
      res.status(404).json({ error: 'Candidato no encontrado' });
      return;
    }
    const presentation = await loadPresentation(companyId, candidate);
    const isCompany = req.locals?.profile?.role === 'empresa';
    // La empresa solo ve a quien un reclutador le presentó (igual que en su bandeja)
    if (isCompany && !presentation?.presented) {
      res.status(404).json({ error: 'Candidato no encontrado' });
      return;
    }

    const [lastContactRes, companyRes, rejectionsRes] = await Promise.all([
      supabaseAdmin
        .from('candidate_contact_log')
        .select('channel, created_at')
        .eq('company_id', companyId)
        .eq(originColumn(candidate.kind), candidate.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from('companies').select('name').eq('id', companyId).maybeSingle(),
      supabaseAdmin
        .from('candidate_rejections')
        .select(REJECTION_COLUMNS)
        .eq('company_id', companyId)
        .eq(originColumn(candidate.kind), candidate.id)
        .order('created_at', { ascending: false }),
    ]);
    if (rejectionsRes.error) {
      logger.warn('Perfil de candidato: no se pudieron leer los rechazos', { correlationId, error: rejectionsRes.error.message });
    }
    // Sin la migración 025 el registro no existe: el perfil se muestra igual
    if (lastContactRes.error) {
      logger.warn('Perfil de candidato: no se pudo leer el último contacto', { correlationId, error: lastContactRes.error.message });
    }

    // Traza de acceso a datos personales (sin los datos)
    logger.info('Perfil de candidato consultado', { correlationId, companyId, userId, kind: candidate.kind, candidateId: candidate.id });

    const detail: CandidateProfileDetail = {
      ...candidate,
      // La empresa no recibe datos de contacto hasta contratarlo: el contacto lo lleva el reclutador
      contact: isCompany && presentation?.company_decision !== 'contratado'
        ? { email: null, phone: null, linkedin_url: candidate.contact.linkedin_url }
        : candidate.contact,
      last_contact: isCompany ? null : lastContactRes.data ?? null,
      // Los rechazos por puesto son notas internas del reclutador
      rejections: isCompany ? [] : ((rejectionsRes.data ?? []) as Parameters<typeof toRejection>[0][]).map(toRejection),
      sender: {
        recruiter_name: req.locals?.profile?.full_name ?? null,
        company_name: (companyRes.data?.name as string) ?? null,
      },
      presentation,
    };
    res.json(detail);
  } catch (err) {
    logger.error('Error obteniendo perfil de candidato', { correlationId, error: err instanceof Error ? err.message : JSON.stringify(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/:kind/:id/contact', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);
  if (!recruiterOnly(req, res)) return;
  try {
    const companyId = req.locals?.companyId;
    const userId = req.locals?.user?.id;
    if (!companyId || !userId) {
      res.status(403).json({ error: 'Usuario sin empresa asignada' });
      return;
    }
    const params = paramsSchema.safeParse(req.params);
    const body = contactSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: 'channel debe ser: whatsapp, email o linkedin' });
      return;
    }

    // Confirma que el candidato es de la empresa antes de escribir nada
    const candidate = await loadCandidate(companyId, params.data.kind, params.data.id);
    if (!candidate) {
      res.status(404).json({ error: 'Candidato no encontrado' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('candidate_contact_log')
      .insert({
        company_id: companyId,
        recruiter_id: userId,
        [originColumn(candidate.kind)]: candidate.id,
        channel: body.data.channel,
      })
      .select('channel, created_at')
      .single();
    if (error) throw error;

    logger.info('Contacto con candidato registrado', { correlationId, companyId, userId, kind: candidate.kind, candidateId: candidate.id, channel: body.data.channel });
    res.status(201).json(data);
  } catch (err) {
    logger.error('Error registrando contacto con candidato', { correlationId, error: err instanceof Error ? err.message : JSON.stringify(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /:kind/:id/rejections — { role?, vacancy_id?, reason? }
 * Rechaza al candidato SOLO para ese puesto: no cambia su estado global, así que
 * sigue apareciendo en búsquedas de otros cargos. Repetir el mismo puesto no duplica.
 */
router.post('/:kind/:id/rejections', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);
  if (!recruiterOnly(req, res)) return;
  try {
    const companyId = req.locals?.companyId;
    const userId = req.locals?.user?.id;
    if (!companyId || !userId) {
      res.status(403).json({ error: 'Usuario sin empresa asignada' });
      return;
    }
    const params = paramsSchema.safeParse(req.params);
    const body = rejectionSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: 'Indica el puesto o la vacante (y un motivo de máximo 500 caracteres)' });
      return;
    }

    let roleLabel = body.data.role ?? '';
    if (body.data.vacancy_id) {
      const { data: vacancy, error } = await supabaseAdmin
        .from('vacancies')
        .select('id, title')
        .eq('id', body.data.vacancy_id)
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      if (!vacancy) {
        res.status(404).json({ error: 'Vacante no encontrada' });
        return;
      }
      roleLabel ||= vacancy.title as string;
    }
    const key = roleKey(roleLabel);
    if (!key) {
      res.status(400).json({ error: 'El puesto debe describir un cargo (p. ej. "contador público")' });
      return;
    }

    const candidate = await loadCandidate(companyId, params.data.kind, params.data.id);
    if (!candidate) {
      res.status(404).json({ error: 'Candidato no encontrado' });
      return;
    }

    const origin = originColumn(candidate.kind);
    const { data, error } = await supabaseAdmin
      .from('candidate_rejections')
      .insert({
        company_id: companyId,
        [origin]: candidate.id,
        role_label: roleLabel.slice(0, 160),
        role_key: key,
        vacancy_id: body.data.vacancy_id ?? null,
        reason: body.data.reason || null,
        rejected_by: userId,
      })
      .select(REJECTION_COLUMNS)
      .single();

    if (error && (error as { code?: string }).code === '23505') {
      // Ya estaba rechazado para ese puesto: idempotente
      const { data: existing, error: readError } = await supabaseAdmin
        .from('candidate_rejections')
        .select(REJECTION_COLUMNS)
        .eq('company_id', companyId)
        .eq(origin, candidate.id)
        .eq('role_key', key)
        .single();
      if (readError) throw readError;
      res.json(toRejection(existing as Parameters<typeof toRejection>[0]));
      return;
    }
    if (error) throw error;

    logger.info('Candidato rechazado para un puesto', { correlationId, companyId, userId, kind: candidate.kind, candidateId: candidate.id, roleKey: key, vacancyId: body.data.vacancy_id ?? null });
    res.status(201).json(toRejection(data as Parameters<typeof toRejection>[0]));
  } catch (err) {
    logger.error('Error rechazando candidato para un puesto', { correlationId, error: err instanceof Error ? err.message : JSON.stringify(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

/** DELETE /:kind/:id/rejections/:rejectionId — deshace un rechazo (vuelve a aparecer para ese puesto). */
router.delete('/:kind/:id/rejections/:rejectionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);
  if (!recruiterOnly(req, res)) return;
  try {
    const companyId = req.locals?.companyId;
    const userId = req.locals?.user?.id;
    if (!companyId || !userId) {
      res.status(403).json({ error: 'Usuario sin empresa asignada' });
      return;
    }
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !z.string().uuid().safeParse(req.params.rejectionId).success) {
      res.status(400).json({ error: 'Parámetros inválidos' });
      return;
    }
    const candidate = await loadCandidate(companyId, params.data.kind, params.data.id);
    if (!candidate) {
      res.status(404).json({ error: 'Candidato no encontrado' });
      return;
    }

    // Empresa + candidato + id: no se puede borrar el rechazo de otra empresa ni de otro candidato
    const { data, error } = await supabaseAdmin
      .from('candidate_rejections')
      .delete()
      .eq('id', req.params.rejectionId)
      .eq('company_id', companyId)
      .eq(originColumn(candidate.kind), candidate.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Rechazo no encontrado' });
      return;
    }

    logger.info('Rechazo por puesto deshecho', { correlationId, companyId, userId, kind: candidate.kind, candidateId: candidate.id, rejectionId: req.params.rejectionId });
    res.status(204).end();
  } catch (err) {
    logger.error('Error deshaciendo rechazo', { correlationId, error: err instanceof Error ? err.message : JSON.stringify(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
