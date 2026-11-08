import { describe, it, expect } from 'vitest';
import { candidateObservations, criteriaSchema } from './candidateObservations';

const codes = (o: ReturnType<typeof candidateObservations>) => o.map((x) => x.code);

describe('candidateObservations', () => {
  it('sin criterios solo marca perfil sin verificar en scraping', () => {
    expect(codes(candidateObservations({ source: 'scraping' }))).toEqual(['unverified_profile']);
    expect(candidateObservations({ source: 'internal' })).toEqual([]);
  });

  it('experiencia faltante con experience_min', () => {
    const o = candidateObservations({ experience_years: null, source: 'scraping' }, { experience_min: 3 });
    expect(codes(o)).toEqual(['experience_missing', 'unverified_profile']);
  });

  it('experiencia por debajo incluye found y requested', () => {
    const [o] = candidateObservations({ experience_years: 1 }, { experience_min: 3 });
    expect(o).toMatchObject({ code: 'experience_below', found: 1, requested: 3 });
  });

  it('experiencia suficiente no genera observación', () => {
    expect(candidateObservations({ experience_years: 5 }, { experience_min: 3 })).toEqual([]);
  });

  it('salario faltante y por encima', () => {
    expect(codes(candidateObservations({}, { salary_max: 5 }))).toEqual(['salary_missing']);
    expect(codes(candidateObservations({ expected_salary: 9 }, { salary_max: 5 }))).toEqual(['salary_above']);
  });

  it('ubicación compara sin tildes ni mayúsculas', () => {
    expect(candidateObservations({ location: 'BOGOTA' }, { location: 'Bogotá' })).toEqual([]);
    expect(codes(candidateObservations({ location: 'Cali' }, { location: 'Bogotá' }))).toEqual(['location_mismatch']);
    expect(codes(candidateObservations({ location: null }, { location: 'Bogotá' }))).toEqual(['location_missing']);
  });

  it('criteriaSchema acota valores', () => {
    expect(criteriaSchema.safeParse({ experience_min: 200 }).success).toBe(false);
    expect(criteriaSchema.safeParse({ salary_max: 2e9 }).success).toBe(false);
    expect(criteriaSchema.safeParse({ location: 'x'.repeat(101) }).success).toBe(false);
    expect(criteriaSchema.safeParse({ experience_min: 2 }).success).toBe(true);
  });
});
