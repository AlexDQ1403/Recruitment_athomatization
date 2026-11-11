import type { CandidateObservation, Fit } from './candidateObservations';
import type { Affinity } from './affinity';

/**
 * Única lista de campos que salen hacia el chat: nunca email ni teléfono.
 * Los mensajes del chat se guardan con esta captura, así que los datos de
 * contacto se piden aparte (GET /api/candidate-profiles/:kind/:id), con
 * autorización y registro, solo cuando el reclutador abre el perfil.
 *
 * `kind` dice de dónde sale el candidato: 'legacy' (tabla candidates: scraping
 * o alta manual) o 'profile' (cuenta propia, candidate_profiles). Sin él no hay
 * forma de pedir su perfil completo.
 */
export const SAFE_CANDIDATE_FIELDS = ['id', 'kind', 'full_name', 'position', 'headline', 'experience_years', 'expected_salary', 'location', 'source', 'status', 'profile_url', 'resume_url', 'skills'] as const;

export type CandidateKind = 'legacy' | 'profile';

export interface PoolCandidate {
  id: string;
  kind: CandidateKind;
  full_name: string;
  position: string | null;
  headline: string | null;
  /** Extracto público (LinkedIn): solo para el modelo, nunca sale al chat. */
  summary?: string | null;
  experience_years: number | null;
  expected_salary: number | null;
  location: string | null;
  source: string;
  status: string;
  profile_url: string | null;
  resume_url: string | null;
  skills: string[];
}

export function sanitizeCandidate(
  c: Record<string, unknown>,
  reason?: string,
  extra?: { observations: CandidateObservation[]; fit: Fit; affinity?: Affinity }
): Record<string, unknown> {
  const safe = Object.fromEntries(SAFE_CANDIDATE_FIELDS.map((k) => [k, c[k]]));
  if (reason) safe.match_reason = reason;
  if (extra) {
    safe.observations = extra.observations;
    safe.fit = extra.fit;
    if (extra.affinity) {
      safe.affinity = extra.affinity.score;
      safe.affinity_parts = extra.affinity.parts;
    }
  }
  return safe;
}
