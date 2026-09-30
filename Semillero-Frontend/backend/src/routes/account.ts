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

// Lo que cada rol puede tocar de su propio perfil. La empresa administra su
// identidad (nombre, correo); el reclutador solo su foto — el resto de su
// ficha (rol, empresa, suspensión) lo gestiona la empresa vía /api/recruiters.
const ALLOWED_FIELDS: Record<string, ('full_name' | 'email' | 'avatar_url')[]> = {
  empresa: ['full_name', 'email', 'avatar_url'],
  recruiter: ['avatar_url'],
};

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().email().max(255).optional(),
  avatar_url: z.string().trim().url().max(2048).nullable().optional(),
});

// GET /api/account/profile
router.get('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.locals!.user!.id;
  const profile = req.locals!.profile!;
  res.json({
    id: userId,
    full_name: profile.full_name ?? null,
    email: req.locals!.user!.email,
    avatar_url: profile.avatar_url ?? null,
    role: profile.role,
  });
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
    // Nunca se lee role/company_id/suspended del body: el whitelist por rol
    // es la única fuente de qué se puede tocar (mismo patrón que recruiters.ts).
    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([k, v]) => allowed.includes(k as never) && v !== undefined)
    ) as { full_name?: string; email?: string; avatar_url?: string | null };

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
      .select('id, full_name, email, avatar_url, role')
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

export default router;
