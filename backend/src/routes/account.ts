import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ProfileField = 'full_name' | 'email' | 'avatar_url' | 'phone' | 'job_title';

// Lo que cada rol puede tocar de su propio perfil
const ALLOWED_FIELDS: Record<string, ProfileField[]> = {
  empresa: ['full_name', 'email', 'avatar_url', 'phone', 'job_title'],
  recruiter: ['full_name', 'avatar_url', 'phone', 'job_title'],
  superAdmin: ['full_name', 'email', 'avatar_url', 'phone', 'job_title'],
};

const PROFILE_COLUMNS = 'id, full_name, email, avatar_url, role, phone, job_title';

// Cadena vacía = borrar el dato
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().email().max(255).optional(),
  avatar_url: z.string().trim().url().max(2048).nullable().optional(),
  phone: optionalText(30).refine((v) => v == null || /^[+\d][\d\s()-]{5,}$/.test(v), 'Teléfono inválido'),
  job_title: optionalText(120),
});

const companySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  industry: optionalText(80),
  city: optionalText(80),
  website: optionalText(255).refine((v) => v == null || /^https?:\/\/\S+\.\S+/.test(v), 'El sitio web debe empezar por http:// o https://'),
  description: optionalText(1000),
});

const COMPANY_COLUMNS = 'id, name, industry, city, website, description, logo_url, created_at';

async function loadCompany(companyId: string) {
  const [{ data: company }, { count: recruiters }, { count: activeVacancies }] = await Promise.all([
    supabaseAdmin.from('companies').select(COMPANY_COLUMNS).eq('id', companyId).single(),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('role', 'recruiter'),
    supabaseAdmin.from('vacancies').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'active'),
  ]);
  if (!company) return null;
  return { ...company, recruiters_count: recruiters ?? 0, active_vacancies: activeVacancies ?? 0 };
}

// GET /api/account/profile
router.get('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.locals!.user!.id;
    const companyId = req.locals!.companyId;

    const [{ data: profile, error }, company] = await Promise.all([
      supabaseAdmin.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single(),
      companyId ? loadCompany(companyId) : Promise.resolve(null),
    ]);

    if (error || !profile) {
      res.status(404).json({ error: 'Perfil no encontrado' });
      return;
    }

    res.json({ ...profile, email: req.locals!.user!.email, company });
  } catch (err) {
    logger.error('Error cargando perfil de cuenta', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/account/profile
router.patch('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.locals!.user!.id;
    const role = req.locals!.profile!.role;

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }

    const allowed = ALLOWED_FIELDS[role] ?? [];
    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([k, v]) => allowed.includes(k as ProfileField) && v !== undefined)
    ) as Partial<Record<ProfileField, string | null>>;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Nada que actualizar' });
      return;
    }

    if (updates.email) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: updates.email,
        email_confirm: true,
      });
      if (authError) {
        const duplicate = /already|registered|exists/i.test(authError.message);
        res.status(duplicate ? 409 : 400).json({
          error: duplicate ? 'Ese correo ya está en uso' : authError.message,
        });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    logger.info('Perfil de cuenta actualizado', { userId, role, fields: Object.keys(updates) });
    res.json(data);
  } catch (err) {
    logger.error('Error actualizando perfil de cuenta', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/account/company — solo la empresa edita su propia ficha
router.patch('/company', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const role = req.locals!.profile!.role;
    const companyId = req.locals!.companyId;
    if (role !== 'empresa' || !companyId) {
      res.status(403).json({ error: 'Solo la empresa puede editar estos datos' });
      return;
    }

    const parsed = companySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
      return;
    }

    const updates = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Nada que actualizar' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('companies')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', companyId);

    if (error) {
      // companies.name es UNIQUE
      const duplicate = error.code === '23505';
      res.status(duplicate ? 409 : 400).json({
        error: duplicate ? 'Ya existe una empresa con ese nombre' : error.message,
      });
      return;
    }

    logger.info('Ficha de empresa actualizada', { companyId, fields: Object.keys(updates) });
    res.json(await loadCompany(companyId));
  } catch (err) {
    logger.error('Error actualizando ficha de empresa', { error: String(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
