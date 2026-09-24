import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';

const router = Router();
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MAX_DAYS = 90;

interface ContactedCandidate {
  candidate_id: string;
  full_name: string;
  position: string | null;
  email: string | null;
  contacted_at: string;
  reason: string | null;
  current_status: string;
}

interface RecruiterGroup {
  recruiter_id: string | null;
  recruiter_name: string;
  recruiter_email: string | null;
  candidates: ContactedCandidate[];
}

/**
 * GET /api/reports/daily-contacted?days=1
 *
 * Candidatos que pasaron a 'en_contacto' en el periodo, agrupados por el
 * reclutador que hizo el cambio. Lo consume n8n para el envío diario por
 * correo, y la página /reports para verlo en la aplicación.
 *
 * Se apoya en candidate_status_history —no en candidates.updated_at— porque
 * updated_at cambia con cualquier edición y contaría candidatos que no fueron
 * contactados en el periodo.
 */
router.get(
  '/daily-contacted',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.locals?.profile?.role !== 'empresa') {
        res.status(403).json({ error: 'Solo las empresas pueden consultar reportes' });
        return;
      }

      const companyId = req.locals.companyId;
      if (!companyId) {
        res.status(403).json({ error: 'Usuario sin empresa asignada' });
        return;
      }

      const days = Math.min(Math.max(parseInt(req.query.days as string) || 1, 1), MAX_DAYS);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // 1. Candidatos de la empresa (acota el historial a nuestro tenant)
      const { data: candidates, error: candidatesError } = await supabaseAdmin
        .from('candidates')
        .select('id, full_name, position, email, status')
        .eq('company_id', companyId);

      if (candidatesError) {
        res.status(500).json({ error: candidatesError.message });
        return;
      }

      if (!candidates || candidates.length === 0) {
        res.json({ period_days: days, since, total: 0, recruiters: [] });
        return;
      }

      const candidateById = new Map(candidates.map((c) => [c.id, c]));

      // 2. Transiciones a 'en_contacto' dentro del periodo
      const { data: history, error: historyError } = await supabaseAdmin
        .from('candidate_status_history')
        .select('candidate_id, changed_by, changed_at, reason')
        .eq('to_status', 'en_contacto')
        .gte('changed_at', since)
        .in('candidate_id', [...candidateById.keys()])
        .order('changed_at', { ascending: false });

      if (historyError) {
        res.status(500).json({ error: historyError.message });
        return;
      }

      if (!history || history.length === 0) {
        res.json({ period_days: days, since, total: 0, recruiters: [] });
        return;
      }

      // 3. Nombres de los reclutadores implicados
      const recruiterIds = [...new Set(history.map((h) => h.changed_by).filter(Boolean))];
      const { data: recruiters } = recruiterIds.length
        ? await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', recruiterIds)
        : { data: [] };

      const recruiterById = new Map((recruiters ?? []).map((r) => [r.id, r]));

      // 4. Agrupar por reclutador
      const groups = new Map<string, RecruiterGroup>();

      for (const entry of history) {
        const candidate = candidateById.get(entry.candidate_id);
        if (!candidate) continue;

        const key = entry.changed_by ?? 'sin_asignar';
        if (!groups.has(key)) {
          const recruiter = entry.changed_by ? recruiterById.get(entry.changed_by) : undefined;
          groups.set(key, {
            recruiter_id: entry.changed_by ?? null,
            recruiter_name: recruiter?.full_name ?? 'Sin asignar',
            recruiter_email: recruiter?.email ?? null,
            candidates: [],
          });
        }

        groups.get(key)!.candidates.push({
          candidate_id: candidate.id,
          full_name: candidate.full_name,
          position: candidate.position ?? null,
          email: candidate.email ?? null,
          contacted_at: entry.changed_at,
          reason: entry.reason ?? null,
          current_status: candidate.status,
        });
      }

      const result = [...groups.values()].sort(
        (a, b) => b.candidates.length - a.candidates.length
      );

      logger.info('Reporte de contactados generado', {
        companyId,
        days,
        total: history.length,
        recruiters: result.length,
      });

      res.json({
        period_days: days,
        since,
        total: history.length,
        recruiters: result,
      });
    } catch (err) {
      logger.error('Error generando reporte', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

export default router;
