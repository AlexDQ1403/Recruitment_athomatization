import { z } from 'zod';

/** Criterios que el LLM extrae de la consulta */
/** El modelo a veces manda `null` (o "") para lo que no se pidió */
export const nullish = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === null || v === '' ? undefined : v), schema.optional());

export const criteriaSchema = z.object({
  experience_min: nullish(z.number().min(0).max(80)),
  salary_max: nullish(z.number().min(0).max(1_000_000_000)),
  location: nullish(z.string().trim().min(1).max(100)),
}).partial();

export type SearchCriteria = z.infer<typeof criteriaSchema>;

export const fitSchema = z.enum(['full', 'partial']);
export type Fit = z.infer<typeof fitSchema>;

export type ObservationCode =
  | 'experience_missing'
  | 'salary_missing'
  | 'location_missing'
  | 'experience_below'
  | 'salary_above'
  | 'location_mismatch'
  | 'unverified_profile';

export interface CandidateObservation {
  code: ObservationCode;
  severity: 'warn' | 'info';
  found?: number | string;
  requested?: number | string;
}

interface ObservableCandidate {
  experience_years?: number | null;
  expected_salary?: number | null;
  location?: string | null;
  source?: string | null;
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const isNil = (v: unknown) => v === null || v === undefined;

/** Observaciones derivadas comparando campos reales (nunca las decide el LLM) */
export function candidateObservations(
  c: ObservableCandidate,
  criteria: SearchCriteria = {}
): CandidateObservation[] {
  const obs: CandidateObservation[] = [];

  if (criteria.experience_min !== undefined) {
    if (isNil(c.experience_years)) {
      obs.push({ code: 'experience_missing', severity: 'warn', requested: criteria.experience_min });
    } else if (c.experience_years! < criteria.experience_min) {
      obs.push({ code: 'experience_below', severity: 'warn', found: c.experience_years!, requested: criteria.experience_min });
    }
  }

  if (criteria.salary_max !== undefined) {
    if (isNil(c.expected_salary)) {
      obs.push({ code: 'salary_missing', severity: 'warn', requested: criteria.salary_max });
    } else if (c.expected_salary! > criteria.salary_max) {
      obs.push({ code: 'salary_above', severity: 'warn', found: c.expected_salary!, requested: criteria.salary_max });
    }
  }

  if (criteria.location !== undefined) {
    if (!c.location || !c.location.trim()) {
      obs.push({ code: 'location_missing', severity: 'warn', requested: criteria.location });
    } else if (normalize(c.location) !== normalize(criteria.location)) {
      obs.push({ code: 'location_mismatch', severity: 'warn', found: c.location, requested: criteria.location });
    }
  }

  if (c.source === 'scraping') obs.push({ code: 'unverified_profile', severity: 'info' });

  return obs;
}

export const warnCount = (obs: CandidateObservation[]) =>
  obs.filter((o) => o.severity === 'warn').length;
