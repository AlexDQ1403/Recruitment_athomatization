import { describe, it, expect } from 'vitest';
import { computeCompanyReport } from './companyReport';
import type { InsightsData } from './insightsData';

const NOW = new Date('2026-11-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
const lastDays = (n: number) => ({ from: new Date(daysAgo(n)), to: NOW });

const data = (): InsightsData => ({
  now: NOW,
  legacy: [
    { id: 'l1', full_name: 'Carlos', position: 'Contador', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(20) },
    { id: 'l2', full_name: 'Ana', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(20) },
    { id: 'l3', full_name: 'Juan', position: 'Contador', source: 'internal', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(60) },
    { id: 'l4', full_name: 'Rosa', position: 'Contadora', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(30) },
    { id: 'l5', full_name: 'Luis', position: 'Contador', source: 'scraping', status: 'seguimiento', vacancy_id: 'v1', created_at: daysAgo(30) },
  ],
  bridges: [
    { legacy_candidate_id: 'l1', candidate_profile_id: null, status: 'seguimiento', source: 'scraping', presented_to_company: true, presented_at: daysAgo(9), presented_by: 'r1', company_decision: 'pendiente', created_at: daysAgo(9) },
    // Juan: presentado y autorizado hace 50 días (fuera de un rango de 30)
    { legacy_candidate_id: 'l3', candidate_profile_id: null, status: 'seguimiento', source: 'internal', presented_to_company: true, presented_at: daysAgo(55), presented_by: 'r1', company_decision: 'contratado', company_decided_at: daysAgo(50), created_at: daysAgo(55) },
    // Rosa y Luis: descartados en el rango con el mismo motivo escrito distinto
    { legacy_candidate_id: 'l4', candidate_profile_id: null, status: 'seguimiento', source: 'scraping', presented_to_company: true, presented_at: daysAgo(8), presented_by: 'r1', company_decision: 'descartado', company_decided_at: daysAgo(6), company_decision_reason: 'No tiene inglés', created_at: daysAgo(8) },
    { legacy_candidate_id: 'l5', candidate_profile_id: null, status: 'seguimiento', source: 'scraping', presented_to_company: true, presented_at: daysAgo(8), presented_by: 'r2', company_decision: 'descartado', company_decided_at: daysAgo(4), company_decision_reason: 'no tiene ingles.', created_at: daysAgo(8) },
  ],
  applications: [{ candidate_profile_id: 'p1', vacancy_id: 'v2', status: 'enviada', created_at: daysAgo(3) }],
  profiles: [{ id: 'p1', full_name: 'Marta', title: 'Enfermera' }],
  contacts: [
    { legacy_candidate_id: 'l1', candidate_profile_id: null, created_at: daysAgo(12), channel: 'whatsapp', recruiter_id: 'r1' },
    { legacy_candidate_id: 'l1', candidate_profile_id: null, created_at: daysAgo(11), channel: 'email', recruiter_id: 'r1' },
    { legacy_candidate_id: 'l2', candidate_profile_id: null, created_at: daysAgo(45), channel: 'email', recruiter_id: 'r2' },
  ],
  rejections: [],
  vacancies: [
    { id: 'v1', title: 'Contador público', status: 'active', created_at: daysAgo(70), deadline: null },
    { id: 'v2', title: 'Enfermera', status: 'active', created_at: daysAgo(5), deadline: null },
    { id: 'v3', title: 'Cerrada vieja', status: 'closed', created_at: daysAgo(200), deadline: null },
  ],
  recruiters: [{ id: 'r1', full_name: 'Sofía' }, { id: 'r2', full_name: 'Andrés' }],
  team: [
    { id: 'r1', full_name: 'Sofía', email: null, last_login: null, suspended: false },
    { id: 'r2', full_name: 'Andrés', email: null, last_login: null, suspended: false },
  ],
});

describe('computeCompanyReport', () => {
  it('totales: solo hechos dentro del rango (contactos por candidato, no por mensaje)', () => {
    const r = computeCompanyReport(data(), lastDays(30));
    expect(r.totals).toMatchObject({ found: 5, contacted: 1, presented: 3, authorized: 0, discarded: 2, pending_now: 1 });
    // Rosa 2 días, Luis 4 días → 3
    expect(r.totals.avg_days_to_decide).toBe(3);
  });

  it('un rango más amplio incluye lo de antes', () => {
    const r = computeCompanyReport(data(), lastDays(90));
    expect(r.totals).toMatchObject({ presented: 4, authorized: 1, contacted: 2 });
  });

  it('por vacante: embudo y días hasta el primer presentado; las cerradas sin movimiento no salen', () => {
    const r = computeCompanyReport(data(), lastDays(30));
    expect(r.vacancies.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(r.vacancies[0]).toMatchObject({ found: 4, contacted: 1, presented: 3, discarded: 2, days_to_first_presented: 15 });
    expect(r.vacancies[1]).toMatchObject({ found: 1, presented: 0, days_to_first_presented: null });
    expect(r.unassigned).toEqual({ found: 0, contacted: 0 });
  });

  it('agrupa motivos de descarte iguales aunque estén escritos distinto', () => {
    const r = computeCompanyReport(data(), lastDays(30));
    expect(r.discard_reasons).toEqual([{ reason: 'No tiene inglés', count: 2 }]);
    expect(r.discarded_without_reason).toBe(0);
  });

  it('por reclutador: contactados, presentados y acierto de lo que la empresa decidió', () => {
    const r = computeCompanyReport(data(), lastDays(90));
    expect(r.recruiters.map((m) => [m.full_name, m.contacted, m.presented, m.authorized, m.discarded, m.hit_rate])).toEqual([
      ['Sofía', 1, 3, 1, 1, 50],
      ['Andrés', 1, 1, 0, 1, 0],
    ]);
  });
});
