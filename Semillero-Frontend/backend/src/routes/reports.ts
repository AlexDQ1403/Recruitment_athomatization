import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middlewares/companyAuth';
import { loadInsightsData } from '../services/insightsData';
import { computeCompanyReport } from '../services/companyReport';

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
 * Candidatos contactados en el periodo, agrupados por el reclutador: los que
 * pasaron a 'en_contacto' y los que se contactaron de verdad por WhatsApp,
 * correo o LinkedIn desde la plataforma (migración 025). Antes solo contaba lo
 * primero y el reporte salía vacío aunque el equipo estuviera contactando. Lo consume n8n para el envío diario por
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

      // 2b. Contactos reales desde la plataforma (si la tabla aún no existe, solo el historial)
      const { data: contactRows, error: contactsError } = await supabaseAdmin
        .from('candidate_contact_log')
        .select('legacy_candidate_id, recruiter_id, channel, created_at')
        .eq('company_id', companyId)
        .gte('created_at', since)
        .not('legacy_candidate_id', 'is', null);
      if (contactsError) logger.warn('Reporte: sin registro de contactos (¿migración 025?)', { error: contactsError.message });

      const CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'correo', linkedin: 'LinkedIn' };
      // Un candidato por reclutador: el contacto más reciente
      const seen = new Set<string>();
      const entries = [
        ...(history ?? []).map((h) => ({ ...h })),
        ...(contactRows ?? []).map((c) => ({
          candidate_id: c.legacy_candidate_id as string,
          changed_by: c.recruiter_id as string | null,
          changed_at: c.created_at as string,
          reason: `Contactado por ${CHANNEL[c.channel as string] ?? c.channel}`,
        })),
      ]
        .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)))
        .filter((e) => candidateById.has(e.candidate_id))
        .filter((e) => !seen.has(`${e.changed_by}:${e.candidate_id}`) && seen.add(`${e.changed_by}:${e.candidate_id}`));

      if (entries.length === 0) {
        res.json({ period_days: days, since, total: 0, recruiters: [] });
        return;
      }

      // 3. Nombres de los reclutadores implicados
      const recruiterIds = [...new Set(entries.map((h) => h.changed_by).filter(Boolean))];
      const { data: recruiters } = recruiterIds.length
        ? await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', recruiterIds)
        : { data: [] };

      const recruiterById = new Map((recruiters ?? []).map((r) => [r.id, r]));

      // 4. Agrupar por reclutador
      const groups = new Map<string, RecruiterGroup>();

      for (const entry of entries) {
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
        total: entries.length,
        recruiters: result.length,
      });

      res.json({
        period_days: days,
        since,
        total: entries.length,
        recruiters: result,
      });
    } catch (err) {
      logger.error('Error generando reporte', { error: String(err) });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

/** Fecha 'YYYY-MM-DD' en hora de Colombia (UTC-5, sin horario de verano). */
const bogota = (day: string, end: boolean) => new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}-05:00`);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

/**
 * GET /api/reports/results?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Reporte de resultados para gerencia: por vacante, motivos de descarte y
 * rendimiento por reclutador en el rango (ver services/companyReport.ts).
 * Sin fechas: últimos 30 días.
 */
router.get('/results', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const companyId = req.locals?.companyId;
  if (!companyId) {
    res.status(403).json({ error: 'Tu usuario no está asociado a una empresa' });
    return;
  }
  const today = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDay = typeof req.query.to === 'string' && req.query.to ? req.query.to : today;
  const fromDay = typeof req.query.from === 'string' && req.query.from
    ? req.query.from
    : new Date(bogota(toDay, false).getTime() - 29 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!DAY_RE.test(fromDay) || !DAY_RE.test(toDay)) {
    res.status(400).json({ error: 'Las fechas deben tener el formato AAAA-MM-DD' });
    return;
  }
  const from = bogota(fromDay, false);
  const to = bogota(toDay, true);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    res.status(400).json({ error: 'El rango de fechas no es válido' });
    return;
  }
  if ((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000) > MAX_RANGE_DAYS) {
    res.status(400).json({ error: 'El rango máximo es de un año' });
    return;
  }
  try {
    const data = await loadInsightsData(supabaseAdmin, companyId, (what, error) =>
      logger.warn(`Reporte de resultados: sin ${what} (¿migración pendiente?)`, { companyId, error: error instanceof Error ? error.message : JSON.stringify(error) }));
    res.json(computeCompanyReport(data, { from, to }));
  } catch (err) {
    logger.error('Error armando el reporte de resultados', { companyId, error: err instanceof Error ? err.message : JSON.stringify(err) });
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
