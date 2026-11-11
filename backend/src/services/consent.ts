import type { Request } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Autorización de tratamiento de datos (Ley 1581 de 2012).
 * La versión debe coincidir con frontend/src/lib/legal.ts: al cambiarla, la app
 * vuelve a pedir la aceptación a todas las cuentas.
 */
export const CONSENT_VERSION = '2026-11-11';
export const CONSENT_DOCUMENTS = ['privacy', 'terms'] as const;

/** IP y navegador de quien acepta. El proxy de Next los reenvía; son un indicio, no prueba de origen */
export function clientInfo(req: Request): { ip: string | null; user_agent: string | null } {
  const forwarded = req.get('x-client-ip')?.split(',')[0]?.trim();
  const ip = (forwarded || req.ip || '').slice(0, 64) || null;
  const ua = (req.get('x-client-user-agent') || req.get('user-agent') || '').slice(0, 300) || null;
  return { ip, user_agent: ua };
}

/** Guarda la aceptación de la versión vigente de cada documento (idempotente) */
export async function recordConsent(
  supabase: SupabaseClient,
  userId: string,
  req: Request
): Promise<{ error: string | null }> {
  const info = clientInfo(req);
  const rows = CONSENT_DOCUMENTS.map((document) => ({
    user_id: userId,
    document,
    version: CONSENT_VERSION,
    ...info,
  }));
  const { error } = await supabase
    .from('consents')
    .upsert(rows, { onConflict: 'user_id,document,version', ignoreDuplicates: true });
  return { error: error?.message ?? null };
}

/** true si la persona ya aceptó la versión vigente de todos los documentos */
export async function hasCurrentConsent(
  supabase: SupabaseClient,
  userId: string
): Promise<{ accepted: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('consents')
    .select('document')
    .eq('user_id', userId)
    .eq('version', CONSENT_VERSION);
  if (error) return { accepted: false, error: error.message };
  const docs = new Set((data ?? []).map((r: { document: string }) => r.document));
  return { accepted: CONSENT_DOCUMENTS.every((d) => docs.has(d)), error: null };
}
