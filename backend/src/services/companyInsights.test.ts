import { describe, it, expect } from 'vitest';
import { computeCompanyInsights } from './companyInsights';
import type { InsightsData } from './insightsData';

const NOW = new Date('2026-11-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const data = (): InsightsData => ({
  now: NOW,
  legacy: [
    { id: 'l1', full_name: 'Carlos', position: 'Contador', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(20) },
    { id: 'l2', full_name: 'Ana', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(20) },
    { id: 'l3', full_name: 'Juan', position: 'Contador', source: 'internal', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(30) },
    { id: 'l4', full_name: 'Rosa', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(30) },
  ],
  bridges: [
    // Carlos espera hace 9 días; Ana hace 2
    { legacy_candidate_id: 'l1', candidate_profile_id: null, status: 'seguimiento', source: 'scraping', presented_to_company: true, presented_at: daysAgo(9), presented_by: 'r1', company_decision: 'pendiente', created_at: daysAgo(9) },
    { legacy_candidate_id: 'l2', candidate_profile_id: null, status: 'seguimiento', source: 'scraping', presented_to_company: true, presented_at: daysAgo(2), presented_by: 'r2', company_decision: 'pendiente', created_at: daysAgo(2) },
    // Juan: contratado 4 días después de presentarlo; Rosa: descartada 2 días después, con motivo
    { legacy_candidate_id: 'l3', candidate_profile_id: null, status: 'seguimiento', source: 'internal', presented_to_company: true, presented_at: daysAgo(10), presented_by: 'r1', company_decision: 'contratado', company_decided_at: daysAgo(6), created_at: daysAgo(10) },
    { legacy_candidate_id: 'l4', candidate_profile_id: null, status: 'seguimiento', source: 'scraping', presented_to_company: true, presented_at: daysAgo(8), presented_by: 'r1', company_decision: 'descartado', company_decided_at: daysAgo(6), company_decision_reason: 'No tiene inglés', created_at: daysAgo(8) },
  ],
  applications: [],
  profiles: [],
  contacts: [
    { legacy_candidate_id: 'l1', candidate_profile_id: null, created_at: daysAgo(12), channel: 'whatsapp', recruiter_id: 'r1' },
    { legacy_candidate_id: 'l2', candidate_profile_id: null, created_at: daysAgo(3), channel: 'email', recruiter_id: 'r2' },
    { legacy_candidate_id: 'l2', candidate_profile_id: null, created_at: daysAgo(45), channel: 'email', recruiter_id: 'r2' },
  ],
  rejections: [],
  vacancies: [
    { id: 'v1', title: 'Contador público', status: 'active', created_at: daysAgo(30), deadline: null },
    { id: 'v2', title: 'Enfermera', status: 'active', created_at: daysAgo(5), deadline: null },
  ],
  recruiters: [{ id: 'r1', full_name: 'Sofía' }, { id: 'r2', full_name: 'Andrés' }, { id: 'r3', full_name: 'Nueva' }],
  team: [
    { id: 'r1', full_name: 'Sofía', email: null, last_login: daysAgo(1), suspended: false },
    { id: 'r2', full_name: 'Andrés', email: null, last_login: daysAgo(3), suspended: false },
    { id: 'r3', full_name: 'Nueva', email: null, last_login: null, suspended: false },
  ],
});

describe('computeCompanyInsights', () => {
  it('decisiones pendientes: las que más llevan esperando primero, con quién lo presentó', () => {
    const r = computeCompanyInsights(data());
    expect(r.pending.map((p) => [p.full_name, p.days, p.event.by])).toEqual([['Carlos', 9, 'Sofía'], ['Ana', 2, 'Andrés']]);
    expect(r.kpis).toMatchObject({ pending: 2, oldest_pending_days: 9, hired: 1, discarded: 1, active_vacancies: 2 });
  });

  it('tiempo promedio de respuesta de la empresa (presentación → decisión)', () => {
    // Juan 4 días, Rosa 2 días → 3
    expect(computeCompanyInsights(data()).kpis.avg_days_to_decide).toBe(3);
  });

  it('últimas decisiones con su motivo', () => {
    const r = computeCompanyInsights(data());
    expect(r.recent_decisions.find((d) => d.full_name === 'Rosa')).toMatchObject({ stage: 'descartado_empresa', event: { reason: 'No tiene inglés' } });
  });

  it('equipo: contactos de los últimos 30 días, presentados, contratados y tasa', () => {
    const r = computeCompanyInsights(data());
    expect(r.team.map((m) => [m.full_name, m.contacted_30d, m.presented, m.hired, m.hire_rate])).toEqual([
      ['Sofía', 1, 3, 1, 33],
      ['Andrés', 1, 1, 0, 0],
      ['Nueva', 0, 0, 0, null],
    ]);
  });

  it('vacantes con su salud (sin candidatos → alerta)', () => {
    const r = computeCompanyInsights(data());
    expect(r.vacancies.find((v) => v.id === 'v2')?.alert).toBe('sin_candidatos');
  });
});
