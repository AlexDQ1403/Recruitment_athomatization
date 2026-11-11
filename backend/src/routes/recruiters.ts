import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import rateLimit from 'express-rate-limit';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const recruiterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// La invitación lleva a crear la contraseña; debe estar en las redirecciones permitidas de Supabase
const WELCOME_REDIRECT = `${config.CORS_ORIGIN.replace(/\/+$/, '')}/reset-password?bienvenida=1`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/recruiters — la empresa invita a un reclutador.
 * Supabase le envía el correo de bienvenida (plantilla invitacion.html) con un
 * enlace para crear SU contraseña: la empresa nunca la conoce.
 */
router.post(
  '/',
  recruiterLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'Solo empresas pueden crear reclutadores' });
        return;
      }

      const companyId = req.locals.companyId;
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const full_name = String(req.body?.full_name ?? '').trim();

      if (!EMAIL_RE.test(email) || full_name.length < 2) {
        res.status(400).json({ error: 'Escribe el nombre y un correo válido' });
        return;
      }

      const { data: company } = await supabaseAdmin.from('companies').select('name').eq('id', companyId).maybeSingle();

      const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: WELCOME_REDIRECT,
        // Datos que usa la plantilla del correo
        data: { full_name, role: 'recruiter', account_type: 'reclutador', company_name: company?.name ?? null },
      });

      if (inviteError || !data?.user) {
        const exists = /already|registered|exists/i.test(inviteError?.message ?? '');
        logger.warn('Invitación de reclutador rechazada', { companyId, error: inviteError?.message });
        res.status(400).json({ error: exists ? 'Ya existe una cuenta con ese correo' : 'No se pudo enviar la invitación' });
        return;
      }

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

      await supabaseAdmin.from('recruiter_audit_log').insert({
        company_id: companyId,
        recruiter_id: data.user.id,
        action: 'created',
        changed_by: req.locals.user?.id,
        changes: { email, full_name, role: 'recruiter', invited: true },
      });

      logger.info('Reclutador invitado', { companyId, recruiterId: data.user.id });
      res.status(201).json({
        id: data.user.id,
        email,
        full_name,
        role: 'recruiter',
        company_id: companyId,
        invited: true,
      });
    } catch (err) {
      logger.error('Error invitando reclutador', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/recruiters - Listar recruiters (empresa-only)
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'No autorizado' });
        return;
      }

      const companyId = req.locals.companyId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, error, count } = await supabaseAdmin
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

      // Invitación pendiente: nunca entró y aún no confirma su correo (no ha creado su contraseña)
      const recruiters = await Promise.all((data ?? []).map(async (r) => {
        if (r.last_login) return { ...r, invite_pending: false };
        const { data: auth } = await supabaseAdmin.auth.admin.getUserById(r.id as string);
        return { ...r, invite_pending: !!auth?.user && !auth.user.email_confirmed_at };
      }));

      res.json({ recruiters, total: count || 0, limit, offset });
    } catch (err) {
      logger.error('Error listando recruiters', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/recruiters/:id/invite — reenviar la invitación a quien aún no crea su contraseña
router.post(
  '/:id/invite',
  recruiterLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'No autorizado' });
        return;
      }
      const companyId = req.locals.companyId;
      const { data: recruiter } = await supabaseAdmin
        .from('profiles').select('id, email, full_name, role, company_id').eq('id', req.params.id).single();
      if (!recruiter || recruiter.company_id !== companyId || recruiter.role !== 'recruiter') {
        res.status(404).json({ error: 'Reclutador no encontrado' });
        return;
      }
      const { data: auth } = await supabaseAdmin.auth.admin.getUserById(recruiter.id as string);
      if (auth?.user?.email_confirmed_at) {
        res.status(409).json({ error: 'Ya creó su contraseña: puede entrar con su correo' });
        return;
      }
      const { data: company } = await supabaseAdmin.from('companies').select('name').eq('id', companyId).maybeSingle();
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(recruiter.email as string, {
        redirectTo: WELCOME_REDIRECT,
        data: { full_name: recruiter.full_name, role: 'recruiter', account_type: 'reclutador', company_name: company?.name ?? null },
      });
      if (error) {
        logger.warn('Reenvío de invitación rechazado', { companyId, error: error.message });
        res.status(400).json({ error: 'No se pudo reenviar la invitación' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error('Error reenviando invitación', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// PATCH /api/recruiters/:id - Actualizar recruiter
router.patch(
  '/:id',
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
      const { data: recruiter, error: checkError } = await supabaseAdmin
        .from('profiles')
        .select('id, company_id, role')
        .eq('id', recruiterId)
        .single();

      // Solo reclutadores de la empresa (no la cuenta de empresa ni otros roles)
      if (checkError || !recruiter || recruiter.company_id !== companyId || recruiter.role !== 'recruiter') {
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
      const { data: recruiter } = await supabaseAdmin
        .from('profiles')
        .select('company_id, role')
        .eq('id', recruiterId)
        .single();

      if (!recruiter || recruiter.company_id !== companyId || recruiter.role !== 'recruiter') {
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
