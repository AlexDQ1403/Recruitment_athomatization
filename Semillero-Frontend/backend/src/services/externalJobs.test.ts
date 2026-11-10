import { describe, it, expect } from 'vitest';
import { normalizeGetOnBoard, normalizeGoogleJobs } from './externalJobs';

describe('normalizeGetOnBoard', () => {
  const job = (over: Record<string, unknown>, links: Record<string, unknown> = { public_url: 'https://www.getonbrd.com/jobs/contador-acme' }) => ({
    id: 'contador-acme',
    links,
    attributes: {
      title: 'Contador/a', description: '<ul><li>NIIF &amp; impuestos</li></ul>', remote_modality: 'hybrid', countries: ['Colombia'],
      min_salary: 1500, max_salary: 2000, published_at: 1793133968,
      company: { data: { attributes: { name: 'Acme' } } },
      ...over,
    },
  });

  it('oferta de Colombia con empresa, salario, fecha y descripción sin HTML', () => {
    const [j] = normalizeGetOnBoard({ data: [job({})] });
    expect(j).toMatchObject({
      id: 'gob:contador-acme', source: 'getonbrd', title: 'Contador/a', company: 'Acme',
      location: 'Colombia · híbrido', remote: false, url: 'https://www.getonbrd.com/jobs/contador-acme', description: 'NIIF & impuestos',
    });
    expect(j.salary).toContain('US$1.500');
  });

  it('descarta lo que no se puede tomar desde Colombia y los enlaces que no son http(s)', () => {
    const jobs = normalizeGetOnBoard({ data: [
      job({ countries: ['Chile'], remote_modality: 'no_remote' }),
      job({ countries: ['Chile'], remote_modality: 'fully_remote' }),
      job({}, { public_url: 'javascript:alert(1)' }),
    ] });
    expect(jobs.map((j) => j.location)).toEqual(['Remoto']);
  });
});

describe('normalizeGoogleJobs', () => {
  it('usa el enlace del portal donde se postula y su nombre como fuente', () => {
    const [j] = normalizeGoogleJobs({ jobs_results: [{
      job_id: 'abc', title: 'Contador público', company_name: 'Beta', location: 'Bogotá', via: 'a través de LinkedIn',
      apply_options: [{ title: 'elempleo.com', link: 'https://www.elempleo.com/co/ofertas-trabajo/contador-123' }],
      detected_extensions: { posted_at: 'hace 3 días' },
    }] }, new Date('2026-11-18T12:00:00Z'));
    expect(j).toMatchObject({ source: 'google_jobs', source_label: 'elempleo.com', url: 'https://www.elempleo.com/co/ofertas-trabajo/contador-123', company: 'Beta' });
    expect(j.published_at).toBe('2026-11-15T12:00:00.000Z');
  });
});
