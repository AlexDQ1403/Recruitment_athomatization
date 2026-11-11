import { describe, it, expect } from 'vitest';
import { searchTerms, matchesTerms } from './searchTerms';

describe('searchTerms', () => {
  it('quita tildes, palabras genéricas y números', () => {
    expect(searchTerms('Busco un Contador con 3 años de experiencia en Bogotá hasta 4.000.000')).toEqual(['contad', 'bogota']);
  });

  it('deja raíces que cubren variantes de género y derivadas', () => {
    expect(matchesTerms(searchTerms('contadora'), 'Contador Público')).toBe(true);
    expect(matchesTerms(searchTerms('contador'), 'Contadora Pública')).toBe(true);
    expect(matchesTerms(searchTerms('contador'), 'Contaduría y finanzas')).toBe(true);
  });

  it('solo produce [a-z0-9]: seguro para el filtro or de PostgREST', () => {
    const terms = searchTerms('dev),position.eq.x,(%_* <script> análisis');
    for (const t of terms) expect(t).toMatch(/^[a-z0-9]+$/);
  });

  it('máximo 8 términos y sin repetidos', () => {
    const terms = searchTerms('python python java kotlin swift golang rustlang scala elixir haskell clojure');
    expect(terms.length).toBeLessThanOrEqual(8);
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe('matchesTerms', () => {
  it('ignora nulos y no coincide sin términos', () => {
    expect(matchesTerms(['contad'], null, undefined, 'Contador')).toBe(true);
    expect(matchesTerms([], 'Contador')).toBe(false);
  });
});
