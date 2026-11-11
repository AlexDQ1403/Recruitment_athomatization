import { describe, it, expect } from 'vitest';
import { roleKey, sameRole, rejectedForRole, type Rejection } from './rejections';
import { searchTerms } from './searchTerms';

const same = (a: string, b: string) => sameRole(searchTerms(a), searchTerms(b));

describe('roleKey', () => {
  it('normaliza tildes, mayúsculas, orden y palabras genéricas', () => {
    expect(roleKey('Contador Público')).toBe(roleKey('público contador'));
    expect(roleKey('Busco un CONTADOR público')).toBe(roleKey('contador publico'));
  });

  it('vacío si no describe un cargo', () => {
    expect(roleKey('vacante')).toBe('');
  });
});

describe('sameRole', () => {
  it.each([
    ['contador', 'contador público', true],
    ['contadora pública', 'Contador Público', true],
    ['contador', 'busco contador en Bogotá', true],
    ['auxiliar contable', 'auxiliar administrativo', false],
    ['contador público', 'auxiliar contable', false],
    ['desarrollador java', 'desarrollador python', false],
    ['enfermera', 'contador', false],
  ])('%s vs %s → %s', (a, b, expected) => {
    expect(same(a, b)).toBe(expected);
  });

  it('sin raíces nunca coincide', () => {
    expect(sameRole([], ['contad'])).toBe(false);
  });
});

describe('rejectedForRole', () => {
  const r = (role: string): Rejection => ({
    id: role, kind: 'legacy', candidate_id: 'c1', role_label: role, role_key: roleKey(role),
    vacancy_id: null, reason: null, created_at: '2026-11-10T00:00:00Z',
  });

  it('devuelve el rechazo del mismo puesto y deja pasar los de otros', () => {
    const rejections = [r('contador público')];
    expect(rejectedForRole(rejections, searchTerms('contador'))?.role_label).toBe('contador público');
    expect(rejectedForRole(rejections, searchTerms('auxiliar administrativo'))).toBeUndefined();
  });
});
