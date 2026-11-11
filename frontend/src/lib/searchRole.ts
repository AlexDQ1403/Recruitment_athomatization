import type { ChatMessage } from '../types';

export const roleFromQuery = (q: string): string => {
  const role = q
    .replace(/^\s*(hola,?\s*)?(busco|buscamos|necesito|necesitamos|quiero|requiero|requerimos)\s+/i, '')
    .replace(/^(a\s+)?(un|una|unos|unas)\s+/i, '')
    .split(/\s+(con|en|para|que|de\s+\d)\s+|[,.;]/i)[0]
    .trim();
  return (role || q).slice(0, 60);
};

export const isSearchAnswer = (m: ChatMessage) =>
  m.role === 'assistant' && (!!m.candidates?.length || /no encontr[ée]|buscando perfiles|fuentes externas/i.test(m.content));

/** "De esos, ¿cuáles…?", "de los anteriores…": pregunta sobre resultados ya mostrados, no una búsqueda nueva. */
export const isFollowUp = (q: string): boolean =>
  /^\s*(y\s+)?(de\s+)?(esos|esas|ellos|ellas|estos|estas|los anteriores|las anteriores)\b/i.test(q);
