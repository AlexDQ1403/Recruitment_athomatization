import { config } from '../config';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export type N8nEventType =
  | 'no_search_results'
  | 'candidate_shortage'
  | 'low_confidence_results'
  | 'interview_request';

export interface N8nPayload {
  event: N8nEventType;
  company_id: string;
  recruiter_id?: string;
  triggered_at: string;
  [key: string]: unknown;
}

/**
 * Llama webhook outbound de n8n de forma asíncrona (non-blocking)
 * Se usa para disparar flujos de fallback cuando:
 * - No hay resultados de búsqueda
 * - Escasez de candidatos (< 30)
 * - Resultados de baja confianza
 */
export async function callN8nOutboundWebhook(
  event: N8nEventType,
  payload: { company_id: string; recruiter_id?: string; [key: string]: unknown }
): Promise<void> {
  if (!config.N8N_WEBHOOK_URL) {
    logger.warn('N8N_WEBHOOK_URL not configured, skipping webhook');
    return;
  }

  const fullPayload: N8nPayload = {
    event,
    triggered_at: new Date().toISOString(),
    ...payload,
  };

  // Calcular firma HMAC si hay secret
  const signature = config.N8N_WEBHOOK_SECRET
    ? crypto
        .createHmac('sha256', config.N8N_WEBHOOK_SECRET)
        .update(JSON.stringify(fullPayload))
        .digest('hex')
    : undefined;

  try {
    // Fire and forget (no await)
    fetch(config.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signature && { 'X-N8N-Signature': signature }),
      },
      body: JSON.stringify(fullPayload),
    }).catch((err) => {
      logger.error('N8n outbound webhook failed', { event, error: String(err) });
    });
  } catch (err) {
    logger.error('N8n webhook error', { event, error: String(err) });
  }
}

// Throttles en memoria: se reinician con el servidor y no se comparten entre
// instancias. Aceptable con una sola instancia; con varias, mover a una tabla.
const SHORTAGE_WINDOW_MS = 60 * 60 * 1000;
const NO_RESULTS_WINDOW_MS = 10 * 60 * 1000;
const lastShortage = new Map<string, number>();
const lastNoResults = new Map<string, number>();

function throttled(store: Map<string, number>, key: string, windowMs: number): boolean {
  const now = Date.now();
  const last = store.get(key);
  if (last !== undefined && now - last < windowMs) return true;
  store.set(key, now);
  return false;
}

/** Solo para pruebas. */
export function resetN8nThrottles(): void {
  lastShortage.clear();
  lastNoResults.clear();
}

/**
 * Trigger para fallback de candidatos (sin resultados).
 * No repite la misma consulta de la misma empresa dentro de 10 min.
 */
export async function triggerNoSearchResults(
  companyId: string,
  recruiterId: string,
  query: string,
  sessionId: string
): Promise<void> {
  const key = `${companyId}:${query.trim().toLowerCase()}`;
  if (throttled(lastNoResults, key, NO_RESULTS_WINDOW_MS)) return;
  await callN8nOutboundWebhook('no_search_results', {
    company_id: companyId,
    recruiter_id: recruiterId,
    query,
    // El workflow "Automated_Recruiter" clasifica `body.mensaje`.
    mensaje: query,
    session_id: sessionId,
  });
}

export function isN8nConfigured(): boolean {
  return !!config.N8N_WEBHOOK_URL;
}

/**
 * Trigger para refill de candidatos (< 30 activos)
 */
export async function triggerCandidateShortage(
  companyId: string,
  currentCount: number,
  threshold: number = 30
): Promise<void> {
  if (throttled(lastShortage, companyId, SHORTAGE_WINDOW_MS)) return;
  await callN8nOutboundWebhook('candidate_shortage', {
    company_id: companyId,
    current_count: currentCount,
    threshold,
  });
}

/**
 * Trigger de entrevista: se dispara cuando un candidato pasa a 'en_contacto'.
 * n8n se encarga de consultar disponibilidad en Google Calendar y enviar el email.
 */
export async function triggerInterviewRequest(
  companyId: string,
  recruiterId: string,
  candidate: { id: string; full_name: string; email?: string | null; position?: string | null }
): Promise<void> {
  await callN8nOutboundWebhook('interview_request', {
    company_id: companyId,
    recruiter_id: recruiterId,
    candidate_id: candidate.id,
    candidate_name: candidate.full_name,
    candidate_email: candidate.email ?? null,
    candidate_position: candidate.position ?? null,
  });
}

/**
 * Trigger para resultados de baja confianza
 */
export async function triggerLowConfidenceResults(
  companyId: string,
  recruiterId: string,
  query: string,
  confidenceScore: number
): Promise<void> {
  await callN8nOutboundWebhook('low_confidence_results', {
    company_id: companyId,
    recruiter_id: recruiterId,
    query,
    confidence_score: confidenceScore,
  });
}
