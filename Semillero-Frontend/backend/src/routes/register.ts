import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// El registro es público: límite estricto para frenar altas automatizadas
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados registros desde esta IP. Intenta más tarde.' },
});

// Respuesta única para no revelar si un correo ya está registrado
const GENERIC_OK = {
  requires_confirmation: true,
  message: 'Revisa tu correo para confirmar la cuenta.',
};

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[a-zA-Z]/, 'La contraseña debe incluir letras')
  .regex(/[0-9]/, 'La contraseña debe incluir números');

const companySchema = z.object({
  company_name: z.string().trim().min(2).max(120),
  industry: z.string().trim().max(120).optional(),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
});

const candidateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  position: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  experience_years: z.coerce.number().int().min(0).max(60).optional(),
});

/**
 * POST /api/register/company
 *
 * Alta self-service de empresa. El rol lo fija ESTE endpoint: nada de lo que
 * llegue en el body puede influir en él.
 */
router.post('/company', registerLimiter, async (req: Request, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);
  let createdUserId: string | null = null;
  let createdCompanyId: string | null = null;

  try {
    const parsed = companySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }

    const { company_name, industry, full_name, email, password } = parsed.data;

    // El nombre de empresa es UNIQUE: comprobarlo antes da un error claro
    const { data: existing } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('name', company_name)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: 'Ya existe una empresa registrada con ese nombre' });
      return;
    }

    // email_confirm: false -> Supabase envía el correo de verificación
    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name },
    });

    if (authError || !created?.user) {
      // No distinguimos "ya existe" de otros fallos: evita enumerar cuentas
      logger.warn('Registro de empresa rechazado', { correlationId, error: authError?.message });
      res.status(200).json(GENERIC_OK);
      return;
    }
    createdUserId = created.user.id;

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({ name: company_name, industry: industry ?? null })
      .select('id')
      .single();

    if (companyError || !company) {
      throw new Error(`No se pudo crear la empresa: ${companyError?.message}`);
    }
    createdCompanyId = company.id;

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: createdUserId,
      email,
      full_name,
      role: 'empresa', // fijado por el endpoint
      company_id: company.id,
    });

    if (profileError) {
      throw new Error(`No se pudo crear el perfil: ${profileError.message}`);
    }

    logger.info('Empresa registrada', { correlationId, companyId: company.id, email });
    res.status(201).json({ ...GENERIC_OK, company_id: company.id });
  } catch (err) {
    // Rollback manual: sin transacciones a través de la API de Supabase
    if (createdCompanyId) {
      await supabaseAdmin.from('companies').delete().eq('id', createdCompanyId);
    }
    if (createdUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    }
    logger.error('Error registrando empresa', { correlationId, error: String(err) });
    res.status(500).json({ error: 'No se pudo completar el registro' });
  }
});

/**
 * POST /api/register/candidate
 *
 * Alta self-service de candidato. Sin company_id: es una identidad
 * independiente que las empresas verán a través de company_candidates.
 */
router.post('/candidate', registerLimiter, async (req: Request, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);
  let createdUserId: string | null = null;

  try {
    const parsed = candidateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }

    const { full_name, email, password, position, location, experience_years } = parsed.data;

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name },
    });

    if (authError || !created?.user) {
      logger.warn('Registro de candidato rechazado', { correlationId, error: authError?.message });
      res.status(200).json(GENERIC_OK);
      return;
    }
    createdUserId = created.user.id;

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: createdUserId,
      email,
      full_name,
      role: 'candidato', // fijado por el endpoint
      company_id: null,
    });

    if (profileError) {
      throw new Error(`No se pudo crear el perfil: ${profileError.message}`);
    }

    const { error: candidateError } = await supabaseAdmin.from('candidate_profiles').insert({
      profile_id: createdUserId,
      position: position ?? null,
      location: location ?? null,
      experience_years: experience_years ?? null,
    });

    if (candidateError) {
      throw new Error(`No se pudo crear la ficha: ${candidateError.message}`);
    }

    logger.info('Candidato registrado', { correlationId, email });
    res.status(201).json(GENERIC_OK);
  } catch (err) {
    if (createdUserId) {
      // profiles y candidate_profiles caen en cascada con el usuario
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    }
    logger.error('Error registrando candidato', { correlationId, error: String(err) });
    res.status(500).json({ error: 'No se pudo completar el registro' });
  }
});

export default router;
