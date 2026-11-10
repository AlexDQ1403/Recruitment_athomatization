import { describe, it, expect } from 'vitest';
import { computeCandidateDashboard, InternalApp, ExternalApp } from './candidateDashboard';

// Miércoles 18 de noviembre de 2026, mediodía en Bogotá
const NOW = new Date('2026-11-18T17:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const internal: InternalApp[] = [
  { id: 'i1', title: 'Contador', company: 'Acme', stage: 'enviada', created_at: daysAgo(20), updated_at: daysAgo(20), match: 84 },
  { id: 'i2', title: 'Analista contable', company: 'Beta', stage: 'preseleccionado', created_at: daysAgo(9), updated_at: daysAgo(5), match: 70 },
  { id: 'i3', title: 'Tesorero', company: 'Gamma', stage: 'no_continua', created_at: daysAgo(3), updated_at: daysAgo(1), match: 40 },
];
const external: ExternalApp[] = [
  { id: 'e1', title: 'Contador senior', company: 'Delta', source: 'elempleo.com', status: 'entrevista', applied_at: daysAgo(12), status_changed_at: daysAgo(2), match_score: 90 },
  { id: 'e2', title: 'Auxiliar contable', company: null, source: 'Get on Board', status: 'postulado', applied_at: daysAgo(15), status_changed_at: null, match_score: null },
];

const run = (over = {}) => computeCandidateDashboard({ internal, external, profile_created_at: daysAgo(40), now: NOW, ...over });

describe('computeCandidateDashboard', () => {
  it('cuánto lleva buscando y hace cuánto se postuló por última vez', () => {
    const d = run();
    expect(d.searching_days).toBe(20);
    expect(d.last_applied_days).toBe(3);
    expect(d.totals).toEqual({ total: 5, internal: 3, external: 2, last_7d: 1, last_30d: 5 });
  });

  it('estados unificados (plataforma y otros sitios) y tasa de respuesta', () => {
    const d = run();
    expect(d.by_state).toEqual({ sin_respuesta: 2, en_proceso: 1, entrevista: 1, avanza: 0, no_continua: 1 });
    expect(d.response_rate).toBe(60);
    // i2: 4 días, i3: 2 días, e1: 10 días → 5,3
    expect(d.avg_days_to_response).toBe(5.3);
    expect(d.avg_match).toBe(71);
  });

  it('seguimiento: sin respuesta hace 10 días o más, la más antigua primero', () => {
    expect(run().follow_up.map((a) => [a.id, a.days_since_applied])).toEqual([['i1', 20], ['e2', 15]]);
  });

  it('cambios recientes, el más nuevo primero', () => {
    expect(run().recent_changes.map((a) => a.id)).toEqual(['i3', 'e1', 'i2']);
  });

  it('postulaciones por semana (lunes a domingo), 8 semanas incluyendo las vacías', () => {
    const d = run();
    expect(d.weekly).toHaveLength(8);
    // Hace 3 días fue domingo 15: cuenta en la semana del lunes 9, junto con la de hace 9 días
    expect(d.weekly[7]).toEqual({ week_start: '2026-11-16', count: 0 });
    expect(d.weekly[6]).toEqual({ week_start: '2026-11-09', count: 2 });
    expect(d.weekly.reduce((a, w) => a + w.count, 0)).toBe(5);
  });

  it('sin postulaciones: cuenta desde que creó el perfil', () => {
    const d = run({ internal: [], external: [] });
    expect(d.searching_days).toBe(40);
    expect(d.last_applied_days).toBeNull();
    expect(d.response_rate).toBeNull();
  });
});
