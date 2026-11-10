/**
 * Términos de búsqueda a partir del mensaje libre del reclutador.
 *
 * Se usan para dos cosas: preseleccionar en la base los candidatos relevantes
 * antes de enviarlos al LLM (el pool tiene tope) y el fallback por palabras
 * clave cuando el LLM falla. Por eso son tolerantes a tildes y a variantes de
 * la palabra: "contador", "Contadora", "contaduría" comparten la raíz "contad".
 */

// Palabras que aparecen en casi cualquier pedido y no describen el cargo.
const STOPWORDS = new Set([
  'busco', 'buscar', 'buscando', 'necesito', 'necesitamos', 'quiero', 'requiero', 'requerimos',
  'candidato', 'candidatos', 'candidata', 'candidatas', 'perfil', 'perfiles', 'persona', 'personas',
  'para', 'como', 'tenga', 'tengan', 'sepa', 'sean', 'este', 'esta', 'estos', 'estas', 'algun', 'alguna',
  'experiencia', 'anos', 'meses', 'salario', 'sueldo', 'hasta', 'maximo', 'minimo', 'millones', 'millon',
  'ciudad', 'trabajo', 'cargo', 'puesto', 'vacante', 'empresa', 'nivel', 'junior', 'senior', 'semi',
  'remoto', 'presencial', 'hibrido', 'donde', 'tiene', 'tienen', 'entre', 'menos', 'desde', 'sobre',
  'colombia', 'favor', 'gracias', 'hola',
]);

const MAX_TERMS = 8;

/** Minúsculas y sin tildes: "Bogotá" → "bogota". */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Raíz aproximada: quita la terminación de género/número en palabras largas. */
const stem = (w: string): string => (w.length > 6 ? w.slice(0, -2) : w);

/**
 * Raíces de las palabras significativas del mensaje (máx. 8). Solo contienen
 * [a-z0-9], así que son seguras para interpolar en un filtro `or` de PostgREST.
 */
export function searchTerms(message: string): string[] {
  const words = fold(message).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words.map(stem))].slice(0, MAX_TERMS);
}

/** true si algún término aparece (sin tildes) en alguno de los textos. */
export function matchesTerms(terms: string[], ...texts: (string | null | undefined)[]): boolean {
  const haystack = texts.filter(Boolean).map((t) => fold(t as string));
  return terms.some((t) => haystack.some((h) => h.includes(t)));
}

/**
 * Qué parte de los términos aparece en los textos (0–1). Distingue entre perfiles
 * que mencionan todo lo pedido ("contador", "NIIF", "Bogotá") y los que solo el cargo.
 */
export function termCoverage(terms: string[], ...texts: (string | null | undefined)[]): number {
  if (terms.length === 0) return 0;
  const haystack = texts.filter(Boolean).map((t) => fold(t as string));
  return terms.filter((t) => haystack.some((h) => h.includes(t))).length / terms.length;
}
