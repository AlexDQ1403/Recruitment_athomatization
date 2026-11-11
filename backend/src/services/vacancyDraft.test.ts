import { describe, it, expect, vi } from 'vitest';

// llm.ts lee la configuración del backend (que termina el proceso si faltan variables)
vi.mock('../config', () => ({ config: { OPENROUTER_API_KEY: 'sk-or-test' } }));

import { sanitizeDraft, formatDescription } from './vacancyDraft';

describe('sanitizeDraft', () => {
  it('pasa un borrador completo y válido tal cual', () => {
    const { draft, notes } = sanitizeDraft({
      title: 'Contador(a) público(a)',
      description: 'Buscamos contador...',
      location: 'Bogotá',
      modality: 'híbrido',
      salary_min: 2500000,
      salary_max: 3000000,
      experience_years_min: 2,
      skills: ['NIIF', 'SIIGO', 'Declaraciones tributarias'],
      notes: ['No indicaste beneficios'],
    }, 'contadora bogota');
    expect(draft).toEqual({
      title: 'Contador(a) público(a)', description: 'Buscamos contador...', location: 'Bogotá', modality: 'híbrido',
      salary_min: 2500000, salary_max: 3000000, experience_years_min: 2, skills: ['NIIF', 'SIIGO', 'Declaraciones tributarias'],
    });
    expect(notes).toEqual(['No indicaste beneficios']);
  });

  it('corrige lo que el formulario rechazaría: salario invertido, montos en texto, modalidad sin tilde, skills repetidas', () => {
    const { draft } = sanitizeDraft({
      title: 'Auxiliar contable', modality: 'Hibrido', salary_min: '3.000.000', salary_max: 2000000,
      experience_years_min: '1', skills: ['Excel', 'excel', ' ', 'SIIGO'],
    }, 'x');
    expect(draft).toMatchObject({ modality: 'híbrido', salary_min: 2000000, salary_max: 3000000, experience_years_min: 1, skills: ['Excel', 'SIIGO'] });
  });

  it('no inventa: sin salario ni ciudad quedan vacíos; valores absurdos se descartan', () => {
    const { draft } = sanitizeDraft({ title: 'Enfermera jefe', salary_max: -5, experience_years_min: 300, modality: 'a distancia' }, 'x');
    expect(draft.salary_min).toBeUndefined();
    expect(draft.salary_max).toBeUndefined();
    expect(draft.location).toBeUndefined();
    expect(draft.experience_years_min).toBe(0);
    expect(draft.modality).toBe('presencial');
  });

  it('respuesta inservible del modelo: usa el texto como título y pide revisarlo', () => {
    const { draft, notes } = sanitizeDraft('no soy json', 'necesito una contadora para Bogotá');
    expect(draft.title).toBe('necesito una contadora para Bogotá');
    expect(draft.skills).toEqual([]);
    expect(notes[0]).toBe('Revisa el título del cargo.');
  });
});

describe('formatDescription', () => {
  it('separa en secciones y viñetas una descripción que llegó en un solo párrafo', () => {
    expect(formatDescription('Buscamos contador(a). Responsabilidades: - Elaborar informes. - Conciliar cuentas. Requisitos: - Título en contaduría.'))
      .toBe('Buscamos contador(a).\n\nResponsabilidades:\n- Elaborar informes.\n- Conciliar cuentas.\n\nRequisitos:\n- Título en contaduría.');
  });

  it('no altera una descripción ya formateada ni guiones dentro de palabras', () => {
    const ok = 'Resumen del rol.\n\nRequisitos:\n- Manejo de Excel\n- Buen trato socio-cultural';
    expect(formatDescription(ok)).toBe(ok);
  });
});
