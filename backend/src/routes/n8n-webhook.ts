import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';
import { candidateObservations } from '../services/candidateObservations';
import { sanitizeCandidate } from '../services/chatCandidate';
import { normalizePhone } from '../services/contact';
import { computeAffinity } from '../services/affinity';
import { searchTerms, termCoverage } from '../services/searchTerms';
import { loadRejections, rejectedForRole } from '../services/rejections';

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
      // Solo perfiles de persona: las páginas de ofertas (/jobs/...) no son candidatos.
      .refine((u) => /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\/in\/[^/?#]+/i.test(u), 'Debe ser un perfil de linkedin.com/in/')
      .optional()
  ),
  'Especializacion/descripcion': z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  // Opcionales: lo que el scraping sabe del perfil público
  Telefono: z.preprocess(emptyToUndef, z.coerce.string().trim().max(40).optional()),
  // Titular del resultado de LinkedIn ("Contadora Pública | NIIF | Impuestos")
  Titular: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
  // Extracto (snippet) del resultado de búsqueda
  Resumen: z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
  Experiencia: optionalInt(80),
  Aspiracion: optionalInt(1_000_000_000),
  Ubicacion: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  'Fecha de busqueda': z.preprocess(
    emptyToUndef,
    z
      .union([z.string(), z.number()])
      .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Fecha inválida')
      .optional()
  ),
}).refine((b) => !!b.urlLinkedin || !!b['Correo Personal'], {
  // Sin ninguno de los dos no hay forma de contactar ni de deduplicar al candidato.
  message: 'Se requiere urlLinkedin o Correo Personal',
  path: ['urlLinkedin'],
});

/** Forma canónica de un perfil: `https://www.linkedin.com/in/<slug>` */
function normalizeLinkedin(url: string): string {
  const slug = new URL(url).pathname.split('/').filter(Boolean)[1] ?? '';
  return `https://www.linkedin.com/in/${slug.toLowerCase()}`;
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
  // n8n_request_id es igual para todos los candidatos de una solicitud: solo sirve junto con el nombre
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
    'email', 'phone', 'linkedin_url', 'position', 'headline', 'summary', 'experience_years', 'expected_salary', 'location',
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

/** POST /n8n-webhook */
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
      full_name: tidyName(body.Nombre),
      email: body['Correo Personal']?.toLowerCase() ?? null,
      linkedin_url: body.urlLinkedin ? normalizeLinkedin(body.urlLinkedin) : null,
      // Sin especialización, el titular de LinkedIn es el mejor cargo disponible
      position: body['Especializacion/descripcion'] ?? body.Titular ?? '',
      headline: body.Titular ?? null,
      summary: body.Resumen ?? null,
      experience_years: body.Experiencia ?? null,
      expected_salary: body.Aspiracion ?? null,
      location: body.Ubicacion ?? null,
      source: 'scraping',
      status: 'seguimiento',
      n8n_request_id: body.IdSolicitud,
      n8n_search_date: body['Fecha de busqueda'] !== undefined
        ? new Date(body['Fecha de busqueda']).toISOString()
        : null,
      phone: normalizePhone(body.Telefono),
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

const searchCompleteSchema = z.object({
  company_id: z.string().uuid(),
  session_id: z.string().uuid(),
  // Ids que devolvió `POST /` para cada candidato guardado (insertado o ya existente).
  candidate_ids: z.array(z.string().uuid()).max(10),
});

const CHAT_CANDIDATE_COLUMNS =
  'id, full_name, position, headline, summary, experience_years, expected_salary, location, source, status, profile_url, resume_url';

const EXTERNAL_ROLE_MIN = 45;
const EXTERNAL_ROLE_MAX = 95;

/** "ana jackeline piñeros" → "Ana Jackeline Piñeros" (solo si llegó todo en minúsculas o mayúsculas). */
export function tidyName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n !== n.toLowerCase() && n !== n.toUpperCase()) return n;
  return n.toLocaleLowerCase('es-CO').replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('es-CO'));
}

/** Suma lo encontrado afuera a la entrada del historial de la consulta que originó la búsqueda. */
async function addToSearchHistory(sessionId: string, companyId: string, found: number): Promise<void> {
  const [{ data: session }, { data: lastQuery }] = await Promise.all([
    supabaseAdmin.from('chat_sessions').select('user_id').eq('id', sessionId).maybeSingle(),
    supabaseAdmin.from('chat_messages').select('content').eq('session_id', sessionId).eq('role', 'user')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!session?.user_id || !lastQuery?.content) return;
  const { data: entry } = await supabaseAdmin
    .from('search_history')
    .select('id, candidates_found')
    .eq('user_id', session.user_id)
    .eq('company_id', companyId)
    .eq('query', lastQuery.content)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!entry) return;
  await supabaseAdmin.from('search_history')
    .update({ candidates_found: (entry.candidates_found ?? 0) + found })
    .eq('id', entry.id);
}

/** POST /n8n-webhook/search-complete */
router.post('/search-complete', async (req: Request, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);

  try {
    const parsed = searchCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(body)'))];
      logger.warn('n8n search-complete: cuerpo inválido', { correlationId, fields });
      res.status(400).json({ error: 'Cuerpo inválido', fields });
      return;
    }
    const { company_id: companyId, session_id: sessionId, candidate_ids: ids } = parsed.data;

    const { data: session } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!session) {
      logger.warn('n8n search-complete: sesión no encontrada para la empresa', { correlationId, companyId, sessionId });
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }

    let candidates: Record<string, unknown>[] = [];
    if (ids.length > 0) {
      const [{ data, error }, { data: lastQuery }] = await Promise.all([
        supabaseAdmin
          .from('candidates')
          .select(CHAT_CANDIDATE_COLUMNS)
          .eq('company_id', companyId)
          .in('id', ids),
        // La consulta del reclutador que originó esta búsqueda externa
        supabaseAdmin
          .from('chat_messages')
          .select('content')
          .eq('session_id', sessionId)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (error) throw error;
      const terms = searchTerms(String(lastQuery?.content ?? ''));
      const rejections = await loadRejections(supabaseAdmin, companyId, (data ?? []).map((c) => c.id as string), []);
      candidates = (data ?? [])
        .filter((c) => c.status !== 'rechazado' && !rejectedForRole(rejections.get(`legacy:${c.id}`) ?? [], terms))
        .map((c) => {
          const coverage = termCoverage(terms, c.position, c.headline, c.summary, c.location);
          const roleScore = Math.round(EXTERNAL_ROLE_MIN + (EXTERNAL_ROLE_MAX - EXTERNAL_ROLE_MIN) * coverage);
          return sanitizeCandidate({ ...c, kind: 'legacy', skills: [] }, undefined, {
            observations: candidateObservations(c),
            fit: 'partial',
            affinity: computeAffinity(c, {}, roleScore),
          });
        })
        .sort((a, b) => Number(b.affinity) - Number(a.affinity));
    }

    const content = candidates.length > 0
      ? `Terminé la búsqueda en fuentes externas: encontré ${candidates.length === 1 ? '1 perfil' : `${candidates.length} perfiles`} para tu consulta.`
      : 'Terminé la búsqueda y no encontré perfiles nuevos para tu consulta.';

    // El historial de búsquedas también refleja lo que encontró n8n
    if (candidates.length > 0) await addToSearchHistory(sessionId, companyId, candidates.length);

    const { error: insertError } = await supabaseAdmin.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content,
      candidates: candidates.length > 0 ? candidates : null,
    });
    if (insertError) throw insertError;

    await supabaseAdmin
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    logger.info('n8n search-complete: mensaje agregado al chat', { correlationId, companyId, sessionId, found: candidates.length });
    res.json({ success: true, found: candidates.length });
  } catch (err) {
    logger.error('n8n search-complete: error', { correlationId, error: String(err) });
    res.status(500).json({ error: 'Error al procesar el aviso de n8n' });
  }
});

export default router;
