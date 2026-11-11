'use client';
import { AffinityPart } from '../../types';

const FACTOR_LABELS: Record<AffinityPart['factor'], string> = {
  cargo: 'Cargo',
  experiencia: 'Experiencia',
  salario: 'Salario',
  ubicacion: 'Ubicación',
};

export const affinityLevel = (score: number): 'alta' | 'media' | 'baja' =>
  score >= 75 ? 'alta' : score >= 50 ? 'media' : 'baja';

const partText = (p: AffinityPart) =>
  p.missing ? 'sin dato' : p.factor === 'cargo' ? `${Math.round(p.score * 100)} %` : p.score >= 1 ? 'cumple' : p.score <= 0 ? 'no cumple' : `${Math.round(p.score * 100)} %`;

/**
 * Porcentaje de afinidad con un desglose desplegable. Explica de dónde sale el
 * número: solo cuentan los criterios que el reclutador pidió.
 */
export const AffinityBadge = ({ score, parts }: { score: number; parts?: AffinityPart[] }) => {
  const level = affinityLevel(score);
  const total = (parts ?? []).reduce((s, p) => s + p.weight, 0);
  return (
    <details className={`affinity affinity-${level}`}>
      <summary title="Ver de dónde sale este porcentaje">
        <span className="affinity-meter" aria-hidden="true">
          <span style={{ width: `${score}%` }} />
        </span>
        <strong>{score} %</strong> afinidad
      </summary>
      {parts && parts.length > 0 && (
        <div className="affinity-detail">
          <ul>
            {parts.map((p) => (
              <li key={p.factor} className={p.missing ? 'missing' : undefined}>
                <span>{FACTOR_LABELS[p.factor]}</span>
                <span>{partText(p)}</span>
                <span className="affinity-weight">peso {Math.round((p.weight / total) * 100)} %</span>
              </li>
            ))}
          </ul>
          <p>
            Qué tanto encaja con lo que pediste. Solo cuentan los criterios que mencionaste; un dato que el
            candidato no tiene vale la mitad. No es la probabilidad de que acepte.
          </p>
        </div>
      )}
    </details>
  );
};
