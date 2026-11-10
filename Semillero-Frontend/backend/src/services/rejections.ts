import type { SupabaseClient } from '@supabase/supabase-js';
import { searchTerms } from './searchTerms';

/**
 * Rechazos por puesto (migración 027). Un candidato rechazado para "contador"
 * no debe aparecer al buscar "contadora pública", pero sí al buscar
 * "auxiliar administrativo".
 */

export type RejectionKind = 'legacy' | 'profile';

export interface Rejection {
  id: string;
  kind: RejectionKind;
  candidate_id: string;
  role_label: string;
  role_key: string;
  vacancy_id: string | null;
  reason: string | null;
  created_at: string;
}

/** Raíces del puesto, ordenadas: misma clave para "Contador Público" y "público contador". */
export const roleKey = (role: string): string => [...new Set(searchTerms(role))].sort().join(' ');

/**
 * ¿Es el mismo puesto? Todas las raíces del más corto deben estar en el otro
 * (por prefijo, para cubrir "contad"/"contado"):
 *   "contador" ≈ "contador público"           → sí
 *   "auxiliar contable" vs "auxiliar administrativo" → no
 */
export function sameRole(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((s) => long.some((l) => l.startsWith(s) || s.startsWith(l)));
}

export const rejectedForRole = (rejections: Rejection[], roleStems: string[]): Rejection | undefined =>
  rejections.find((r) => sameRole(r.role_key.split(' ').filter(Boolean), roleStems));

type Row = {
  id: string; legacy_candidate_id: string | null; candidate_profile_id: string | null;
  role_label: string; role_key: string; vacancy_id: string | null; reason: string | null; created_at: string;
};

export const REJECTION_COLUMNS = 'id, legacy_candidate_id, candidate_profile_id, role_label, role_key, vacancy_id, reason, created_at';

export const toRejection = (r: Row): Rejection => ({
  id: r.id,
  kind: r.legacy_candidate_id ? 'legacy' : 'profile',
  candidate_id: (r.legacy_candidate_id ?? r.candidate_profile_id) as string,
  role_label: r.role_label,
  role_key: r.role_key,
  vacancy_id: r.vacancy_id,
  reason: r.reason,
  created_at: r.created_at,
});

/**
 * Rechazos de la empresa para esos candidatos, agrupados por "kind:id".
 * Si la tabla aún no existe (migración pendiente) devuelve vacío: la búsqueda
 * sigue funcionando, solo sin este filtro.
 */
export async function loadRejections(
  db: SupabaseClient,
  companyId: string,
  legacyIds: string[],
  profileIds: string[]
): Promise<Map<string, Rejection[]>> {
  const byCandidate = new Map<string, Rejection[]>();
  const queries = [
    legacyIds.length ? db.from('candidate_rejections').select(REJECTION_COLUMNS).eq('company_id', companyId).in('legacy_candidate_id', legacyIds) : null,
    profileIds.length ? db.from('candidate_rejections').select(REJECTION_COLUMNS).eq('company_id', companyId).in('candidate_profile_id', profileIds) : null,
  ].filter(Boolean);
  const results = await Promise.all(queries);
  for (const res of results) {
    if (!res || res.error) continue;
    for (const row of (res.data ?? []) as Row[]) {
      const r = toRejection(row);
      const key = `${r.kind}:${r.candidate_id}`;
      if (!byCandidate.has(key)) byCandidate.set(key, []);
      byCandidate.get(key)!.push(r);
    }
  }
  return byCandidate;
}
