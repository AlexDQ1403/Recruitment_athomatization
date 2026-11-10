import { describe, it, expect } from 'vitest';
import { computeAffinity, roleScoreFromFit } from './affinity';

describe('computeAffinity', () => {
  it('sin criterios pedidos solo cuenta el cargo', () => {
    const a = computeAffinity({}, {}, 90);
    expect(a.score).toBe(90);
    expect(a.parts.map((p) => p.factor)).toEqual(['cargo']);
  });

  it('cumple todo lo pedido → 100', () => {
    const a = computeAffinity(
      { experience_years: 5, expected_salary: 3_000_000, location: 'Bogotá' },
      { experience_min: 3, salary_max: 4_000_000, location: 'bogota' },
      100
    );
    expect(a.score).toBe(100);
  });

  it('el dato faltante vale la mitad y se marca como faltante', () => {
    const a = computeAffinity({}, { experience_min: 3 }, 100);
    // (100·50 + 50·20) / 70
    expect(a.score).toBe(86);
    expect(a.parts[1]).toMatchObject({ factor: 'experiencia', score: 0.5, missing: true });
  });

  it('experiencia proporcional; salario resta 0,2 por cada 10 % por encima del tope', () => {
    expect(computeAffinity({ experience_years: 1 }, { experience_min: 4 }, 100).parts[1].score).toBe(0.25);
    expect(computeAffinity({ expected_salary: 1_100_000 }, { salary_max: 1_000_000 }, 100).parts[1].score).toBe(0.8);
    expect(computeAffinity({ expected_salary: 2_000_000 }, { salary_max: 1_000_000 }, 100).parts[1].score).toBe(0);
  });

  it('ubicación: "Área metropolitana de Bogotá D.C." cuenta para Bogotá; otra ciudad no', () => {
    expect(computeAffinity({ location: 'Área metropolitana de Bogotá D.C.' }, { location: 'Bogotá' }, 100).parts[1].score).toBe(1);
    expect(computeAffinity({ location: 'Cali' }, { location: 'Bogotá' }, 100).parts[1].score).toBe(0);
  });

  it('un candidato que cumple más criterios queda por encima de uno con mejor cargo pero que falla todo', () => {
    const criteria = { experience_min: 3, salary_max: 3_000_000, location: 'Medellín' };
    const cumple = computeAffinity({ experience_years: 4, expected_salary: 2_500_000, location: 'Medellín' }, criteria, 70);
    const falla = computeAffinity({ experience_years: 0, expected_salary: 6_000_000, location: 'Cali' }, criteria, 100);
    expect(cumple.score).toBeGreaterThan(falla.score);
  });

  it('sin puntaje del LLM se usa el ajuste full/partial', () => {
    expect(roleScoreFromFit('full')).toBeGreaterThan(roleScoreFromFit('partial'));
  });
});
