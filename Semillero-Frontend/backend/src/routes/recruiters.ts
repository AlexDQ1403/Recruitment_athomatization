import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest, companyAuthMiddleware } from '../middlewares/companyAuth';
import rateLimit from 'express-rate-limit';

const router = Router();
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const recruiterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/recruiters - Crear recruiter (empresa-only)
router.post(
  '/',
  companyAuthMiddleware,
  recruiterLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Validar que sea empresa
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'Solo empresas pueden crear reclutadores' });
        return;
      }

      const companyId = req.locals.companyId;
      const { email, password, full_name } = req.body;

      if (!email || !password || !full_name) {
        res.status(400).json({ error: 'email, password y full_name son requeridos' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });
        return;
      }

      // Crear usuario en auth
      const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        user_metadata: { full_name, role: 'recruiter' },
        email_confirm: true,
      });

      if (createError) {
        res.status(400).json({ error: createError.message });
        return;
      }

      // Crear profile con company_id
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: data.user.id,
          email,
          full_name,
          role: 'recruiter',
          company_id: companyId,
        });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(data.user.id);
        res.status(400).json({ error: 'Error al crear perfil' });
        return;
      }

      // Log a recruiter_audit_log
      await supabaseAdmin.from('recruiter_audit_log').insert({
        company_id: companyId,
        recruiter_id: data.user.id,
        action: 'created',
        changed_by: req.locals.user?.id,
        changes: { email, full_name, role: 'recruiter' },
      });

      logger.info('Recruiter creado', { companyId, recruiterId: data.user.id, email });
      res.status(201).json({
        id: data.user.id,
        email,
        full_name,
        role: 'recruiter',
        company_id: companyId,
      });
    } catch (err) {
      logger.error('Error creando recruiter', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/recruiters - Listar recruiters (empresa-only)
router.get(
  '/',
  companyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'No autorizado' });
        return;
      }

      const companyId = req.locals.companyId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, error, count } = await supabase
        .from('profiles')
        .select(
          'id, email, full_name, role, suspended, last_login, created_at',
          { count: 'exact' }
        )
        .eq('company_id', companyId)
        .eq('role', 'recruiter')
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ recruiters: data, total: count || 0, limit, offset });
    } catch (err) {
      logger.error('Error listando recruiters', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// PATCH /api/recruiters/:id - Actualizar recruiter
router.patch(
  '/:id',
  companyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'No autorizado' });
        return;
      }

      const companyId = req.locals.companyId;
      const recruiterId = req.params.id;
      const { full_name, suspended } = req.body;

      // Validar que pertenece a la empresa
      const { data: recruiter, error: checkError } = await supabase
        .from('profiles')
        .select('id, company_id, role')
        .eq('id', recruiterId)
        .single();

      if (checkError || !recruiter || recruiter.company_id !== companyId) {
        res.status(403).json({ error: 'Reclutador no encontrado' });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (full_name) updates.full_name = full_name;
      if (suspended !== undefined) updates.suspended = suspended;

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', recruiterId)
        .select()
        .single();

      if (updateError) {
        res.status(400).json({ error: updateError.message });
        return;
      }

      // Log to audit
      await supabaseAdmin.from('recruiter_audit_log').insert({
        company_id: companyId,
        recruiter_id: recruiterId,
        action: suspended ? 'suspended' : 'updated',
        changed_by: req.locals.user?.id,
        changes: updates,
      });

      res.json(updated);
    } catch (err) {
      logger.error('Error actualizando recruiter', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// DELETE /api/recruiters/:id - Soft-delete (suspend)
router.delete(
  '/:id',
  companyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'No autorizado' });
        return;
      }

      const companyId = req.locals.companyId;
      const recruiterId = req.params.id;
      const empresaId = req.locals.user?.id;

      // Prevenir auto-eliminación
      if (recruiterId === empresaId) {
        res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
        return;
      }

      // Validar que pertenece
      const { data: recruiter } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', recruiterId)
        .single();

      if (!recruiter || recruiter.company_id !== companyId) {
        res.status(403).json({ error: 'No encontrado' });
        return;
      }

      // Soft-delete
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ suspended: true })
        .eq('id', recruiterId);

      if (updateError) {
        res.status(400).json({ error: updateError.message });
        return;
      }

      // Log
      await supabaseAdmin.from('recruiter_audit_log').insert({
        company_id: companyId,
        recruiter_id: recruiterId,
        action: 'suspended',
        changed_by: empresaId,
        changes: { suspended: true },
      });

      res.status(204).send();
    } catch (err) {
      logger.error('Error eliminando recruiter', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

export default router;
