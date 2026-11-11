import { describe, it, expect } from 'vitest';
import { computeInsights, type InsightsInput } from './recruiterInsights';

const NOW = new Date('2026-11-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const base = (): InsightsInput => ({
  now: NOW,
  legacy: [
    // Scraping, contactada hace 5 días y sin avanzar → recontactar
    { id: 'l1', full_name: 'Laura', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(10) },
    // Contactado ayer → todavía no toca
    { id: 'l2', full_name: 'Pedro', position: 'Contador', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(10) },
    // Aprobado hace 6 días; la empresa no decide → recordar
    { id: 'l3', full_name: 'Ana', position: 'Contadora', source: 'internal', status: 'en_contacto', vacancy_id: 'v1', created_at: daysAgo(40) },
    // Contratado
    { id: 'l4', full_name: 'Juan', position: 'Contador', source: 'scraping', status: 'en_contacto', vacancy_id: 'v1', created_at: daysAgo(20) },
    // Rechazado para un puesto (no cuenta como pendiente aunque se contactó hace mucho)
    { id: 'l5', full_name: 'Rocío', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: null, created_at: daysAgo(5) },
  ],
  bridges: [
    { legacy_candidate_id: 'l3', candidate_profile_id: null, status: 'en_contacto', source: 'internal', presented_to_company: true, presented_at: daysAgo(6), company_decision: 'pendiente', created_at: daysAgo(40) },
    { legacy_candidate_id: 'l4', candidate_profile_id: null, status: 'en_contacto', source: 'scraping', presented_to_company: true, presented_at: daysAgo(8), company_decision: 'contratado', created_at: daysAgo(20) },
  ],
  applications: [
    // Postulación sin revisar
    { candidate_profile_id: 'p1', vacancy_id: 'v2', status: 'enviada', created_at: daysAgo(2) },
    // Ya revisada
    { candidate_profile_id: 'p2', vacancy_id: 'v2', status: 'en_revision', created_at: daysAgo(3) },
  ],
  profiles: [
    { id: 'p1', full_name: 'Mario', title: 'Auxiliar contable' },
    { id: 'p2', full_name: 'Sofía', title: 'Analista' },
  ],
  contacts: [
    { legacy_candidate_id: 'l1', candidate_profile_id: null, created_at: daysAgo(5) },
    { legacy_candidate_id: 'l2', candidate_profile_id: null, created_at: daysAgo(1) },
    { legacy_candidate_id: 'l5', candidate_profile_id: null, created_at: daysAgo(4) },
  ],
  rejections: [{ legacy_candidate_id: 'l5', candidate_profile_id: null }],
  vacancies: [
    { id: 'v1', title: 'Contador público', status: 'active', created_at: daysAgo(30), deadline: null },
    { id: 'v2', title: 'Auxiliar contable', status: 'active', created_at: daysAgo(10), deadline: '2026-11-24' },
    { id: 'v3', title: 'Enfermera', status: 'active', created_at: daysAgo(5), deadline: null },
    { id: 'v4', title: 'Cerrada', status: 'closed', created_at: daysAgo(90), deadline: null },
  ],
});

describe('computeInsights', () => {
  it('embudo con contactos reales (no solo el estado en_contacto)', () => {
    const r = computeInsights(base(), { period: 'all' });
    // l1, l2, l5 por contacto; l3, l4 por estado
    expect(r.funnel).toEqual({ candidates: 7, contacted: 5, approved: 2, hired: 1, rejected: 1 });
  });

  it('el periodo filtra el embudo pero no "qué hacer hoy"', () => {
    const r = computeInsights(base(), { period: '7d' });
    expect(r.funnel.candidates).toBe(3); // l5, p1, p2
    expect(r.actions.follow_up.items.map((i) => i.id)).toEqual(['l1']);
  });

  it('qué hacer hoy: recontactar, revisar postulaciones y recordar a la empresa', () => {
    const r = computeInsights(base(), { period: 'all' });
    expect(r.actions.follow_up).toEqual({ total: 1, items: [expect.objectContaining({ id: 'l1', days: 5, vacancy_title: 'Contador público' })] });
    expect(r.actions.new_applicants.items).toEqual([expect.objectContaining({ kind: 'profile', id: 'p1', full_name: 'Mario', vacancy_title: 'Auxiliar contable', days: 2 })]);
    expect(r.actions.awaiting_company.items).toEqual([expect.objectContaining({ id: 'l3', days: 6 })]);
  });

  it('vacantes: alerta por qué necesitan atención, las más urgentes primero', () => {
    const r = computeInsights(base(), { period: 'all' });
    expect(r.vacancies.map((v) => [v.title, v.alert])).toEqual([
      ['Enfermera', 'sin_candidatos'],
      ['Auxiliar contable', 'vence_pronto'],
      ['Contador público', null],
    ]);
    expect(r.vacancies.find((v) => v.id === 'v1')).toMatchObject({ candidates: 4, contacted: 4, approved: 2, hired: 1 });
    expect(r.vacancies.find((v) => v.id === 'v2')!.deadline_days).toBe(4);
  });

  it('filtro por vacante y por origen', () => {
    const byVacancy = computeInsights(base(), { period: 'all', vacancyId: 'v2' });
    expect(byVacancy.funnel.candidates).toBe(2);
    expect(byVacancy.vacancies.map((v) => v.id)).toEqual(['v2']);
    expect(byVacancy.actions.follow_up.total).toBe(0);

    const bySource = computeInsights(base(), { period: 'all', source: 'scraping' });
    expect(bySource.funnel).toMatchObject({ candidates: 4, hired: 1 });
    expect(bySource.actions.awaiting_company.total).toBe(0); // Ana es interna
  });

  it('orígenes: cuántos avanzan de cada uno', () => {
    const r = computeInsights(base(), { period: 'all' });
    expect(r.sources).toEqual([
      { source: 'scraping', candidates: 4, contacted: 4, approved: 1, hired: 1 },
      { source: 'applicant', candidates: 2, contacted: 0, approved: 0, hired: 0 },
      { source: 'internal', candidates: 1, contacted: 1, approved: 1, hired: 0 },
    ]);
  });

  it('vacante sin contactar y vacante con muchos candidatos sin aprobados', () => {
    const input = base();
    input.vacancies = [{ id: 'v9', title: 'Vendedor', status: 'active', created_at: daysAgo(10), deadline: null }];
    input.legacy = Array.from({ length: 5 }, (_, i) => ({
      id: `x${i}`, full_name: `X${i}`, position: 'Vendedor', source: 'scraping', status: 'seguimiento', vacancy_id: 'v9', created_at: daysAgo(9),
    }));
    input.bridges = [];
    input.contacts = [];
    expect(computeInsights(input, { period: 'all' }).vacancies[0].alert).toBe('sin_contactar');

    input.contacts = [{ legacy_candidate_id: 'x0', candidate_profile_id: null, created_at: daysAgo(1) }];
    expect(computeInsights(input, { period: 'all' }).vacancies[0].alert).toBe('sin_aprobados');
  });

  it('las cerradas no aparecen como opción de filtro', () => {
    expect(computeInsights(base(), { period: 'all' }).vacancy_options.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
  });

  describe('pipeline: quién está en qué etapa de qué vacante', () => {
    const withPeople = (): InsightsInput => {
      const input = base();
      input.recruiters = [{ id: 'r1', full_name: 'Sofía' }, { id: 'r2', full_name: 'Andrés' }];
      input.contacts = [
        { legacy_candidate_id: 'l1', candidate_profile_id: null, created_at: daysAgo(5), channel: 'whatsapp', recruiter_id: 'r1' },
        { legacy_candidate_id: 'l2', candidate_profile_id: null, created_at: daysAgo(1), channel: 'email', recruiter_id: 'r2' },
      ];
      input.bridges[0].presented_by = 'r2';
      input.bridges[1].company_decided_at = daysAgo(2);
      // Mario se postuló a dos vacantes: rechazado para "Auxiliar contable", sigue en "Enfermera"
      input.applications.push({ candidate_profile_id: 'p1', vacancy_id: 'v3', status: 'en_revision', created_at: daysAgo(3) });
      input.rejections = [
        { legacy_candidate_id: 'l5', candidate_profile_id: null, role_label: 'Contador', role_key: 'contad', vacancy_id: null, reason: 'Sin NIIF', rejected_by: 'r1', created_at: daysAgo(4) },
        { legacy_candidate_id: null, candidate_profile_id: 'p1', role_label: 'Auxiliar contable', role_key: 'auxili contab', vacancy_id: 'v2', reason: 'No tiene experiencia', rejected_by: 'r2', created_at: daysAgo(1) },
      ];
      return input;
    };
    const rowOf = (r: ReturnType<typeof computeInsights>, id: string, vacancy: string | null = null) =>
      r.pipeline.rows.find((x) => x.id === id && x.vacancy_id === vacancy)!;

    it('cada fila dice etapa, último movimiento (qué, quién, cuándo, motivo) y qué hacer', () => {
      const r = computeInsights(withPeople(), { period: 'all' });

      expect(rowOf(r, 'l1', 'v1')).toMatchObject({
        stage: 'contactado', vacancy_title: 'Contador público', days: 5, next_action: 'Recontactar o decidir',
        event: { label: 'Contactado por WhatsApp', by: 'Sofía' },
      });
      expect(rowOf(r, 'l2', 'v1')).toMatchObject({ stage: 'contactado', next_action: 'Esperar respuesta', event: { label: 'Contactado por correo', by: 'Andrés' } });
      expect(rowOf(r, 'l3', 'v1')).toMatchObject({ stage: 'aprobado', next_action: 'Recordar a la empresa', event: { by: 'Andrés' } });
      expect(rowOf(r, 'l4', 'v1')).toMatchObject({ stage: 'contratado', days: 2, next_action: null });
      expect(rowOf(r, 'l5')).toMatchObject({
        stage: 'rechazado', vacancy_id: null,
        event: { label: 'Rechazado para «Contador»', by: 'Sofía', reason: 'Sin NIIF' },
      });
      expect(rowOf(r, 'p2', 'v2')).toMatchObject({ stage: 'seguimiento', next_action: 'Contactar' });
    });

    it('rechazado de una postulación no lo saca de la otra', () => {
      const r = computeInsights(withPeople(), { period: 'all' });
      expect(rowOf(r, 'p1', 'v2')).toMatchObject({ stage: 'rechazado', event: { reason: 'No tiene experiencia', by: 'Andrés' } });
      expect(rowOf(r, 'p1', 'v3')).toMatchObject({ stage: 'seguimiento', vacancy_title: 'Enfermera' });
    });

    it('un rechazo por puesto aplica a la vacante del mismo cargo aunque no se hiciera desde ella', () => {
      const input = withPeople();
      input.legacy.push({ id: 'l6', full_name: 'Marta', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(3) });
      input.rejections.push({ legacy_candidate_id: 'l6', candidate_profile_id: null, role_label: 'Contador público', role_key: 'contad publi', vacancy_id: null, reason: null, rejected_by: 'r1', created_at: daysAgo(1) });
      expect(rowOf(computeInsights(input, { period: 'all' }), 'l6', 'v1').stage).toBe('rechazado');
    });

    it('sin vacante: aparece como "sin vacante" con el siguiente paso de asociarlo', () => {
      const input = withPeople();
      input.legacy.push({ id: 'l7', full_name: 'Nuevo', position: 'Contador', source: 'scraping', status: 'seguimiento', vacancy_id: null, created_at: daysAgo(1) });
      expect(rowOf(computeInsights(input, { period: 'all' }), 'l7')).toMatchObject({ stage: 'sin_vacante', next_action: 'Asociarlo a una vacante' });
    });

    it('cuenta por etapa y respeta el filtro de vacante y de periodo', () => {
      const all = computeInsights(withPeople(), { period: 'all' });
      expect(all.pipeline.counts).toMatchObject({ contactado: 2, aprobado: 1, contratado: 1, rechazado: 2, seguimiento: 2, sin_revisar: 0 });
      expect(all.pipeline.total).toBe(all.pipeline.rows.length);

      const v1 = computeInsights(withPeople(), { period: 'all', vacancyId: 'v1' });
      expect(new Set(v1.pipeline.rows.map((x) => x.vacancy_id))).toEqual(new Set(['v1']));

      // 7 días: por el último movimiento (Ana fue aprobada hace 6 días: entra; Pedro, contactado ayer: entra)
      const week = computeInsights(withPeople(), { period: '7d' });
      expect(week.pipeline.rows.map((x) => x.id)).toEqual(expect.arrayContaining(['l3', 'l2']));
    });

    it('postulación sin revisar', () => {
      const r = computeInsights(base(), { period: 'all' });
      expect(rowOf(r, 'p1', 'v2')).toMatchObject({ stage: 'sin_revisar', event: { label: 'Se postuló' }, next_action: 'Revisar su hoja de vida' });
    });
  });
});
