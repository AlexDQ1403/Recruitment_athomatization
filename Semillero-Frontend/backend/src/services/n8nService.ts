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

/**
 * Trigger para fallback de candidatos (sin resultados)
 */
export async function triggerNoSearchResults(
  companyId: string,
  recruiterId: string,
  query: string,
  sessionId: string
): Promise<void> {
  await callN8nOutboundWebhook('no_search_results', {
    company_id: companyId,
    recruiter_id: recruiterId,
    query,
    session_id: sessionId,
  });
}

/**
 * Trigger para refill de candidatos (< 30 activos)
 */
export async function triggerCandidateShortage(
  companyId: string,
  currentCount: number,
  threshold: number = 30
): Promise<void> {
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
