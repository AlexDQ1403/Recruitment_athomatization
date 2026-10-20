import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';

const router = Router();

// Supabase admin client (la autenticación la hace el middleware n8nSecret)
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// n8n envía "" o null para lo que no encontró: ambos se tratan como ausente.
const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

const optionalInt = (max: number) =>
  z.preprocess(emptyToUndef, z.coerce.number().int().min(0).max(max).optional());

const bodySchema = z.object({
  company_id: z.string().uuid(),
  IdSolicitud: z.coerce.string().trim().min(1).max(200),
  Nombre: z.string().trim().min(1).max(200),
  'Correo Personal': z.preprocess(emptyToUndef, z.string().trim().email().max(254).optional()),
  urlLinkedin: z.preprocess(
    emptyToUndef,
    z
      .string()
      .trim()
      .max(500)
      .url()
      .refine((u) => /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com(\/|$)/i.test(u), 'Debe ser una URL de linkedin.com')
      .optional()
  ),
  'Especializacion/descripcion': z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  Experiencia: optionalInt(80),
  Aspiracion: optionalInt(1_000_000_000),
  'Fecha de busqueda': z.preprocess(
    emptyToUndef,
    z
      .union([z.string(), z.number()])
      .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Fecha inválida')
      .optional()
  ),
});

/** Normaliza una URL de LinkedIn para comparar: minúsculas, sin query/hash ni "/" final. */
function normalizeLinkedin(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
}

type CandidateRow = Record<string, unknown> & { id: string };

async function findExisting(
  companyId: string,
  c: { linkedin_url: string | null; email: string | null; n8n_request_id: string; full_name: string }
): Promise<CandidateRow | null> {
  if (c.linkedin_url) {
    const { data } = await supabaseAdmin
      .from('candidates')
      .select('*')
      .eq('company_id', companyId)
      .eq('linkedin_url', c.linkedin_url)
      .limit(1);
    if (data && data.length > 0) return data[0] as CandidateRow;
  }
  if (c.email) {
    const { data } = await supabaseAdmin
      .from('candidates')
      .select('*')
      .eq('company_id', companyId)
      .eq('email', c.email)
      .limit(1);
    if (data && data.length > 0) return data[0] as CandidateRow;
  }
  // n8n_request_id es igual para todos los candidatos de una solicitud: solo
  // sirve junto con el nombre.
  const { data } = await supabaseAdmin
    .from('candidates')
    .select('*')
    .eq('company_id', companyId)
    .eq('n8n_request_id', c.n8n_request_id);
  const name = c.full_name.toLowerCase();
  const match = (data ?? []).find((r) => String(r.full_name ?? '').trim().toLowerCase() === name);
  return (match as CandidateRow | undefined) ?? null;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

/** Solo rellena columnas vacías; nunca toca status, created_by, company_id ni vacancy_id. */
async function fillEmptyFields(existing: CandidateRow, incoming: Record<string, unknown>): Promise<void> {
  const FILLABLE = [
    'email', 'linkedin_url', 'position', 'experience_years', 'expected_salary',
    'n8n_request_id', 'n8n_search_date',
  ];
  const patch: Record<string, unknown> = {};
  for (const k of FILLABLE) {
    if (isEmpty(existing[k]) && !isEmpty(incoming[k])) patch[k] = incoming[k];
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseAdmin.from('candidates').update(patch).eq('id', existing.id);
  if (error) throw error;
}

/**
 * POST /n8n-webhook
 * Recibe candidatos del flujo n8n "Automated_Recruiter webhook".
 * Autenticado por el middleware n8nSecret (X-N8N-Secret).
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);

  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(body)'))];
      logger.warn('n8n webhook: cuerpo inválido', { correlationId, fields });
      res.status(400).json({ error: 'Cuerpo inválido', fields });
      return;
    }
    const body = parsed.data;
    const companyId = body.company_id;

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      logger.warn('n8n webhook: empresa no encontrada', { correlationId, companyId });
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const candidateData = {
      company_id: companyId,
      full_name: body.Nombre,
      email: body['Correo Personal']?.toLowerCase() ?? null,
      linkedin_url: body.urlLinkedin ? normalizeLinkedin(body.urlLinkedin) : null,
      position: body['Especializacion/descripcion'] ?? '',
      experience_years: body.Experiencia ?? null,
      expected_salary: body.Aspiracion ?? null,
      location: null,
      source: 'scraping',
      status: 'seguimiento',
      n8n_request_id: body.IdSolicitud,
      n8n_search_date: body['Fecha de busqueda'] !== undefined
        ? new Date(body['Fecha de busqueda']).toISOString()
        : null,
      phone: null,
      resume_url: null,
      profile_url: null,
      vacancy_id: null,
      created_by: null,
    };

    let existing = await findExisting(companyId, candidateData);

    if (!existing) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('candidates')
        .insert([candidateData])
        .select('id')
        .single();

      if (!insertError && inserted) {
        logger.info('n8n webhook: candidato insertado', { correlationId, companyId, candidateId: inserted.id });
        res.json({ success: true, action: 'inserted', candidate_id: inserted.id });
        return;
      }

      // Carrera con otra petición: el índice único lo rechazó; tratar como actualización.
      if (insertError?.code !== '23505') throw insertError ?? new Error('insert sin resultado');
      existing = await findExisting(companyId, candidateData);
      if (!existing) throw insertError;
    }

    await fillEmptyFields(existing, candidateData);
    logger.info('n8n webhook: candidato existente', { correlationId, companyId, candidateId: existing.id });
    res.json({ success: true, action: 'updated', candidate_id: existing.id });
  } catch (err) {
    logger.error('n8n webhook: error', {
      correlationId,
      error: String(err),
      keys: Object.keys(req.body ?? {}),
    });
    res.status(500).json({ error: 'Error al procesar webhook de n8n' });
  }
});

export default router;
