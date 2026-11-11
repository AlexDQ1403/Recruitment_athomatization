import { describe, it, expect } from 'vitest';
import { computeVacancyMatch, MatchCandidate, skillsMentioned } from './vacancyMatch';

const contadora: MatchCandidate = {
  position: 'Contadora',
  professional_title: 'Contadora pública con NIIF',
  professional_summary: 'Contabilidad y declaraciones de renta para pymes.',
  experience_years: 5,
  expected_salary: 4_000_000,
  location: 'Bogotá D.C.',
  skills: ['NIIF', 'Excel avanzado', 'Conciliaciones bancarias'],
  experience: [{ role_title: 'Contadora', description: 'Declaraciones tributarias mensuales y auditorías internas' }],
  education: [{ degree: 'Contaduría Pública' }],
};

const contador = {
  title: 'Contador(a) público(a)',
  location: 'Bogotá',
  modality: 'presencial',
  salary_min: null,
  salary_max: 4_000_000,
  experience_years_min: 3,
  skills: ['NIIF', 'Declaraciones tributarias', 'Conciliaciones bancarias', 'Auditorías internas', 'SAP'],
};

describe('computeVacancyMatch', () => {
  it('perfil que encaja: puntaje alto con habilidades que tiene y las que le faltan', () => {
    const m = computeVacancyMatch(contadora, contador);
    expect(m.matched_skills).toEqual(['NIIF', 'Declaraciones tributarias', 'Conciliaciones bancarias', 'Auditorías internas']);
    expect(m.missing_skills).toEqual(['SAP']);
    // núcleo: habilidades 4/5 (32 de 40) + cargo (30 de 30) → 0,886; lo demás (30) pesa 0,25 + 0,75 × 0,886
    expect(m.score).toBe(89);
  });

  it('otro oficio: puntaje bajo', () => {
    const m = computeVacancyMatch(contadora, {
      title: 'Auxiliar de enfermería', location: 'Medellín', modality: 'presencial',
      skills: ['Atención al paciente', 'Soporte vital básico', 'Monitoreo de signos vitales'],
    });
    expect(m.score).toBeLessThan(20);
    expect(m.matched_skills).toEqual([]);
  });

  it('la experiencia y la ciudad no inflan una vacante de otro oficio', () => {
    const m = computeVacancyMatch(contadora, { title: 'Desarrollador Python', location: 'Bogotá', experience_years_min: 3 });
    // Antes daba 46 %: 6 años de contaduría y vivir en Bogotá sumaban como si fuera el mismo oficio
    expect(m.score).toBeLessThan(20);
  });

  it('remoto no penaliza la ciudad; datos que faltan valen la mitad', () => {
    const m = computeVacancyMatch(
      { skills: ['NIIF'], experience: [], education: [], position: 'Contador' },
      { title: 'Contador', modality: 'remoto', experience_years_min: 2, skills: ['NIIF'] }
    );
    expect(m.parts.find((p) => p.factor === 'ubicacion')).toMatchObject({ score: 1 });
    expect(m.parts.find((p) => p.factor === 'experiencia')).toMatchObject({ score: 0.5, missing: true });
  });

  it('pedir más salario que el tope de la vacante resta', () => {
    const m = computeVacancyMatch({ ...contadora, expected_salary: 5_000_000 }, contador);
    expect(m.parts.find((p) => p.factor === 'salario')!.score).toBeCloseTo(0.5);
  });

  it('sigla corta no coincide dentro de otra palabra', () => {
    const m = computeVacancyMatch({ skills: ['Javascript'], experience: [], education: [] }, { title: 'Dev', skills: ['Java'] });
    expect(m.missing_skills).toEqual(['Java']);
  });
});

describe('skillsMentioned', () => {
  const text = 'Buscamos contador con manejo de NIIF, SIIGO y Excel avanzado. Deseable inglés intermedio. Experiencia en nómina.';

  it('detecta en la descripción las habilidades del vocabulario, sin repetir', () => {
    expect(skillsMentioned(['NIIF', 'SIIGO', 'Excel', 'Excel avanzado', 'niif', 'Inglés', 'Nómina', 'SAP'], text))
      .toEqual(['NIIF', 'SIIGO', 'Excel', 'Excel avanzado', 'Inglés', 'Nómina']);
  });

  it('exige todas las palabras: "Conciliaciones bancarias" no sale solo por "bancarias"', () => {
    expect(skillsMentioned(['Conciliaciones bancarias'], 'Manejo de cuentas bancarias')).toEqual([]);
  });

  it('con habilidades detectadas, la oferta externa muestra qué tiene y qué le falta el candidato', () => {
    const vocabulary = [...contadora.skills, 'SIIGO', 'Nómina'];
    const m = computeVacancyMatch(contadora, { title: 'Contador', skills: skillsMentioned(vocabulary, text) });
    expect(m.matched_skills).toEqual(['NIIF', 'Excel avanzado']);
    expect(m.missing_skills).toEqual(['SIIGO', 'Nómina']);
  });
});
