import { describe, it, expect } from 'vitest';
import { roleFromQuery, isSearchAnswer, isFollowUp } from './searchRole';
import type { ChatMessage } from '../types';

describe('roleFromQuery', () => {
  it.each([
    ['Busco contadora en Bogotá', 'contadora'],
    ['Necesito un auxiliar contable con 2 años', 'auxiliar contable'],
    ['enfermera jefe para Medellín', 'enfermera jefe'],
    ['Desarrollador backend, 3 años', 'Desarrollador backend'],
    ['Auxiliar de enfermería en Cali', 'Auxiliar de enfermería'],
  ])('%s → %s', (q, role) => {
    expect(roleFromQuery(q)).toBe(role);
  });
});

describe('isSearchAnswer', () => {
  const msg = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'm', role: 'assistant', content: '', created_at: '', ...over });

  it('es búsqueda si trae candidatos, si no encontró o si sigue buscando afuera', () => {
    expect(isSearchAnswer(msg({ candidates: [{ id: 'c1' } as never] }))).toBe(true);
    expect(isSearchAnswer(msg({ content: 'No encontré candidatos que coincidan.' }))).toBe(true);
    expect(isSearchAnswer(msg({ content: 'Terminé la búsqueda y no encontré perfiles nuevos.' }))).toBe(true);
    expect(isSearchAnswer(msg({ content: '🔎 Estoy buscando perfiles nuevos en fuentes externas.' }))).toBe(true);
  });

  it('un saludo o un mensaje del usuario no lo son', () => {
    expect(isSearchAnswer(msg({ content: '¡Hola! ¿En qué te ayudo?' }))).toBe(false);
    expect(isSearchAnswer(msg({ role: 'user', content: 'busco contador' }))).toBe(false);
  });
});

describe('isFollowUp', () => {
  it.each([
    ['De esos, ¿cuáles mencionan Next.js?', true],
    ['y de ellos quién está en Bogotá', true],
    ['De los anteriores, el que tenga inglés', true],
    ['Busco contadora en Bogotá', false],
    ['Desarrollador frontend remoto', false],
  ])('%s → %s', (q, expected) => {
    expect(isFollowUp(q)).toBe(expected);
  });
});
