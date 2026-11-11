import { fold, searchTerms, termCoverage } from './searchTerms';

/** Qué tanto se ajusta el perfil de un candidato a una vacante (0–100) */

export type MatchFactor = 'habilidades' | 'cargo' | 'experiencia' | 'ubicacion' | 'salario';

export interface MatchPart {
  factor: MatchFactor;
  score: number;
  weight: number;
  missing?: boolean;
}

export interface VacancyMatch {
  score: number;
  parts: MatchPart[];
  /** Habilidades de la vacante con evidencia en el perfil. */
  matched_skills: string[];
  /** Habilidades que pide la vacante y no aparecen en el perfil. */
  missing_skills: string[];
}

export interface MatchCandidate {
  position?: string | null;
  professional_title?: string | null;
  professional_summary?: string | null;
  experience_years?: number | null;
  expected_salary?: number | null;
  location?: string | null;
  skills: string[];
  experience: { role_title: string; description?: string | null }[];
  education: { degree: string }[];
  target_position?: string | null;
  keywords?: string[];
  modality?: string | null;
}

export interface MatchVacancy {
  title: string;
  description?: string | null;
  location?: string | null;
  modality?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  experience_years_min?: number | null;
  skills?: string[] | null;
}

const WEIGHTS: Record<MatchFactor, number> = { habilidades: 40, cargo: 30, experiencia: 15, ubicacion: 10, salario: 5 };
const MISSING = 0.5;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const isNil = (v: unknown) => v === null || v === undefined;

const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'en', 'y', 'e', 'o', 'u', 'con', 'para', 'por', 'a', 'al']);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** La palabra aparece en el texto: completa si es corta ("Java" no está en "Javascript"), por raíz si es larga. */
function hasWord(word: string, corpus: string): boolean {
  const pattern = word.length > 6
    ? `(^|[^a-z0-9])${escape(word.slice(0, -2))}`
    : `(^|[^a-z0-9])${escape(word)}(e?s)?([^a-z0-9]|$)`;
  return new RegExp(pattern).test(corpus);
}

/** Una habilidad de la vacante cuenta si aparecen al menos la mitad de sus palabras. */
function hasSkill(skill: string, corpus: string): boolean {
  const words = fold(skill).split(/[^a-z0-9+#]+/).filter((w) => w && !CONNECTORS.has(w));
  if (words.length === 0) return false;
  return words.filter((w) => hasWord(w, corpus)).length / words.length >= 0.5;
}

export const COMMON_SKILLS = [
  'Excel', 'Excel avanzado', 'Word', 'PowerPoint', 'Power BI', 'SAP', 'SIIGO', 'World Office', 'Helisa', 'CRM', 'Salesforce',
  'Inglés', 'Portugués', 'NIIF', 'Declaraciones tributarias', 'Conciliaciones bancarias', 'Auditoría', 'Nómina', 'Facturación electrónica',
  'Presupuestos', 'Costos', 'Tesorería', 'Cartera', 'Contabilidad', 'Servicio al cliente', 'Ventas', 'Atención al cliente', 'Negociación',
  'Python', 'SQL', 'Java', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Angular', 'Vue', 'C#', '.NET', 'PHP', 'Laravel', 'AWS', 'Azure',
  'Docker', 'Kubernetes', 'Git', 'Linux', 'Scrum', 'Jira', 'Figma', 'Marketing digital', 'SEO', 'Google Ads', 'Inventarios', 'Logística',
  'Licencia de conducción', 'Trabajo en equipo', 'Liderazgo', 'Comunicación asertiva',
];

/** Habilidades del vocabulario que la oferta menciona en su texto */
export function skillsMentioned(vocabulary: string[], text: string): string[] {
  const corpus = fold(text);
  const seen = new Set<string>();
  return vocabulary.filter((skill) => {
    const words = fold(skill).split(/[^a-z0-9+#]+/).filter((w) => w && !CONNECTORS.has(w));
    const key = words.join(' ');
    if (!words.length || seen.has(key)) return false;
    seen.add(key);
    return words.every((w) => hasWord(w, corpus));
  });
}

export function computeVacancyMatch(c: MatchCandidate, v: MatchVacancy): VacancyMatch {
  const parts: MatchPart[] = [];

  // Evidencia: lo que el candidato dice saber y lo que ha hecho
  const corpus = fold([
    ...c.skills, ...(c.keywords ?? []), c.professional_title, c.professional_summary, c.position,
    ...c.experience.flatMap((e) => [e.role_title, e.description]), ...c.education.map((e) => e.degree),
  ].filter(Boolean).join(' \n '));

  const vSkills = (v.skills ?? []).map((s) => s.trim()).filter(Boolean);
  const matched = vSkills.filter((s) => hasSkill(s, corpus));
  const missing = vSkills.filter((s) => !matched.includes(s));
  if (vSkills.length > 0) {
    parts.push({ factor: 'habilidades', score: matched.length / vSkills.length, weight: WEIGHTS.habilidades });
  }

  const roles = [c.position, c.professional_title, c.target_position, ...c.experience.map((e) => e.role_title), ...c.education.map((e) => e.degree)];
  const titleTerms = searchTerms(v.title);
  if (titleTerms.length > 0) {
    const hasRoles = roles.some(Boolean);
    parts.push(hasRoles
      ? { factor: 'cargo', score: termCoverage(titleTerms, ...roles), weight: WEIGHTS.cargo }
      : { factor: 'cargo', score: MISSING, weight: WEIGHTS.cargo, missing: true });
  }

  if (!isNil(v.experience_years_min) && v.experience_years_min! > 0) {
    parts.push(isNil(c.experience_years)
      ? { factor: 'experiencia', score: MISSING, weight: WEIGHTS.experiencia, missing: true }
      : { factor: 'experiencia', score: clamp01(c.experience_years! / v.experience_years_min!), weight: WEIGHTS.experiencia });
  }

  const remote = v.modality && fold(v.modality) === 'remoto';
  if (remote) {
    parts.push({ factor: 'ubicacion', score: 1, weight: WEIGHTS.ubicacion });
  } else if (v.location) {
    const city = fold(v.location).split(/[,(-]/)[0].trim();
    parts.push(!c.location
      ? { factor: 'ubicacion', score: MISSING, weight: WEIGHTS.ubicacion, missing: true }
      : { factor: 'ubicacion', score: city && fold(c.location).includes(city) ? 1 : 0.2, weight: WEIGHTS.ubicacion });
  }

  const max = v.salary_max ?? v.salary_min;
  if (!isNil(max) && max! > 0) {
    // Hasta el tope de la vacante cumple; cada 10 % por encima resta 0,2
    parts.push(isNil(c.expected_salary)
      ? { factor: 'salario', score: MISSING, weight: WEIGHTS.salario, missing: true }
      : { factor: 'salario', score: clamp01(1 - ((c.expected_salary! - max!) / max!) * 2), weight: WEIGHTS.salario });
  }

  const core = parts.filter((p) => p.factor === 'habilidades' || p.factor === 'cargo');
  const coreWeight = core.reduce((a, p) => a + p.weight, 0);
  const relevance = coreWeight ? 0.25 + 0.75 * (core.reduce((a, p) => a + p.score * p.weight, 0) / coreWeight) : 1;
  const total = parts.reduce((a, p) => a + p.weight, 0);
  const earned = parts.reduce((a, p) => a + p.score * p.weight * (core.includes(p) ? 1 : relevance), 0);
  const score = total ? Math.round((earned / total) * 100) : 0;
  return { score, parts, matched_skills: matched, missing_skills: missing };
}
