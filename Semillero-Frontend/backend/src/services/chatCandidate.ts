import type { CandidateObservation, Fit } from './candidateObservations';

/** Única lista de campos que salen hacia el chat: nunca email ni teléfono. */
export const SAFE_CANDIDATE_FIELDS = ['id', 'full_name', 'position', 'experience_years', 'expected_salary', 'location', 'source', 'status', 'profile_url', 'resume_url', 'skills'] as const;

export interface PoolCandidate {
  id: string;
  full_name: string;
  position: string | null;
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
  extra?: { observations: CandidateObservation[]; fit: Fit }
): Record<string, unknown> {
  const safe = Object.fromEntries(SAFE_CANDIDATE_FIELDS.map((k) => [k, c[k]]));
  if (reason) safe.match_reason = reason;
  if (extra) {
    safe.observations = extra.observations;
    safe.fit = extra.fit;
  }
  return safe;
}
