import type { SearchCriteria } from './candidateObservations';

/**
 * Afinidad (0–100) de un candidato con lo que pidió el reclutador.
 *
 * Es una suma ponderada y explicable, no una probabilidad de que el candidato
 * acepte: no tenemos datos históricos de respuestas para estimar eso. Solo el
 * cargo lo califica el LLM (similitud semántica); experiencia, salario y
 * ubicación se comparan con los datos reales, como en candidateObservations.
 *
 * Solo cuentan los criterios pedidos: si el reclutador no habló de salario, el
 * salario no suma ni resta. Un dato faltante vale la mitad (ni cumple ni falla).
 */
export type AffinityFactor = 'cargo' | 'experiencia' | 'salario' | 'ubicacion';

export interface AffinityPart {
  factor: AffinityFactor;
  /** 0–1: qué tanto cumple este factor. */
  score: number;
  /** Peso relativo del factor (antes de normalizar). */
  weight: number;
  /** El candidato no tiene el dato. */
  missing?: boolean;
}

export interface Affinity {
  score: number;
  parts: AffinityPart[];
}

const WEIGHTS: Record<AffinityFactor, number> = { cargo: 50, experiencia: 20, salario: 15, ubicacion: 15 };
const MISSING = 0.5;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const isNil = (v: unknown) => v === null || v === undefined;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface AffinityCandidate {
  experience_years?: number | null;
  expected_salary?: number | null;
  location?: string | null;
}

/** roleScore: 0–100, similitud del cargo/habilidades con lo pedido. */
export function computeAffinity(c: AffinityCandidate, criteria: SearchCriteria, roleScore: number): Affinity {
  const parts: AffinityPart[] = [{ factor: 'cargo', score: clamp01(roleScore / 100), weight: WEIGHTS.cargo }];

  if (criteria.experience_min !== undefined) {
    const min = criteria.experience_min;
    parts.push(isNil(c.experience_years)
      ? { factor: 'experiencia', score: MISSING, weight: WEIGHTS.experiencia, missing: true }
      : { factor: 'experiencia', score: min === 0 ? 1 : clamp01(c.experience_years! / min), weight: WEIGHTS.experiencia });
  }

  if (criteria.salary_max !== undefined) {
    const max = criteria.salary_max;
    // Hasta el tope cumple; cada 10 % por encima resta 0,2 (50 % por encima = 0)
    parts.push(isNil(c.expected_salary)
      ? { factor: 'salario', score: MISSING, weight: WEIGHTS.salario, missing: true }
      : { factor: 'salario', score: max === 0 ? 0 : clamp01(1 - ((c.expected_salary! - max) / max) * 2), weight: WEIGHTS.salario });
  }

  if (criteria.location !== undefined) {
    const wanted = fold(criteria.location);
    const has = c.location ? fold(c.location) : '';
    parts.push(!has
      ? { factor: 'ubicacion', score: MISSING, weight: WEIGHTS.ubicacion, missing: true }
      // "Área metropolitana de Bogotá D.C." cuenta para "Bogotá"
      : { factor: 'ubicacion', score: has.includes(wanted) || wanted.includes(has) ? 1 : 0, weight: WEIGHTS.ubicacion });
  }

  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round((parts.reduce((s, p) => s + p.score * p.weight, 0) / total) * 100);
  return { score, parts: parts.map((p) => ({ ...p, score: Math.round(p.score * 100) / 100 })) };
}

/** Sin puntaje del LLM (fallback por palabras clave o resultados de n8n). */
export const roleScoreFromFit = (fit: 'full' | 'partial' | undefined): number => (fit === 'partial' ? 60 : 85);
