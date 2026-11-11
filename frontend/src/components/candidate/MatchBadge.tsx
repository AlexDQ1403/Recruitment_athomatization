'use client';
import { MatchFactor, VacancyMatch } from '../../services/candidatePortalService';

const FACTOR_LABELS: Record<MatchFactor, string> = {
  habilidades: 'Habilidades',
  cargo: 'Cargo',
  experiencia: 'Experiencia',
  ubicacion: 'Ubicación',
  salario: 'Salario',
};

export const matchLevel = (score: number) =>
  score >= 75 ? { label: 'Muy afín', tone: 'high' } : score >= 50 ? { label: 'Afín', tone: 'mid' } : { label: 'Poco afín', tone: 'low' };

/** "82 % · Muy afín" con color según el nivel. */
export const MatchBadge = ({ score }: { score: number }) => {
  const level = matchLevel(score);
  return (
    <span className={`match-badge ${level.tone}`} aria-label={`Ajuste a tu perfil: ${score} %, ${level.label}`}>
      <strong>{score} %</strong> {level.label}
    </span>
  );
};

/** Cada factor con su barra: el candidato ve de dónde sale el porcentaje. */
export const MatchBreakdown = ({ match }: { match: VacancyMatch }) => (
  <ul className="match-parts">
    {match.parts.map((p) => (
      <li key={p.factor}>
        <span className="match-part-name">{FACTOR_LABELS[p.factor]}</span>
        <span className="match-part-bar" aria-hidden="true"><span style={{ width: `${Math.round(p.score * 100)}%` }} /></span>
        <span className="match-part-value">{p.missing ? 'Sin dato en tu perfil' : `${Math.round(p.score * 100)} %`}</span>
      </li>
    ))}
  </ul>
);

/** Lo que tienes y lo que te falta de lo que pide la vacante. */
export const SkillsFit = ({ match, max = 6 }: { match: VacancyMatch; max?: number }) => (
  <>
    {match.matched_skills.length > 0 && (
      <p className="match-skills">
        <span className="match-skills-label">Tienes</span>
        {match.matched_skills.slice(0, max).map((s) => <span key={s} className="match-chip have">{s}</span>)}
      </p>
    )}
    {match.missing_skills.length > 0 && (
      <p className="match-skills">
        <span className="match-skills-label">Te falta</span>
        {match.missing_skills.slice(0, max).map((s) => <span key={s} className="match-chip miss">{s}</span>)}
      </p>
    )}
  </>
);
