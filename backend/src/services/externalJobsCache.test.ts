import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheKeyOf, clearExternalJobsCache, findExternalJob, searchExternalJobs, ExternalJobsStore } from './externalJobs';

const gobJob = {
  id: 'contador-acme', links: { public_url: 'https://www.getonbrd.com/jobs/contador-acme' },
  attributes: { title: 'Contador', countries: ['Colombia'], remote_modality: 'hybrid', company: { data: { attributes: { name: 'Acme' } } } },
};
const googleJob = { job_id: 'g1', title: 'Contador público', company_name: 'Beta', apply_options: [{ title: 'elempleo.com', link: 'https://www.elempleo.com/oferta-1' }] };

/** Caché en memoria que imita a Supabase */
function fakeStore(usage = 0) {
  const rows = new Map<string, { at: number; jobs: never[]; sources: never[] }>();
  let searches = usage;
  const store: ExternalJobsStore & { rows: typeof rows; searches: () => number } = {
    rows,
    searches: () => searches,
    get: async (k) => rows.get(k) ?? null,
    set: async (k, _q, _l, e) => { rows.set(k, e as never); },
    findJob: async (id) => [...rows.values()].flatMap((r) => r.jobs as { id: string }[]).find((j) => j.id === id) as never ?? null,
    usage: async () => searches,
    addUsage: async () => { searches++; },
  };
  return store;
}

const fetchMock = vi.fn();

beforeEach(() => {
  clearExternalJobsCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('getonbrd') ? { data: [gobJob] } : { jobs_results: [googleJob] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const calls = (host: string) => fetchMock.mock.calls.filter(([u]) => String(u).includes(host)).length;

describe('caché de ofertas externas', () => {
  it('búsquedas parecidas comparten la misma clave', () => {
    expect(cacheKeyOf('Contadora', 'Bogotá')).toBe(cacheKeyOf('CONTADOR.', 'bogota'));
    expect(cacheKeyOf('Ingeniera de datos', null)).toBe(cacheKeyOf('ingeniero de datos', null));
    expect(cacheKeyOf('Contador', 'Bogotá')).not.toBe(cacheKeyOf('Contador', 'Cali'));
  });

  it('la segunda búsqueda sale de lo guardado: no gasta SerpApi aunque la memoria se haya borrado', async () => {
    const store = fakeStore();
    const first = await searchExternalJobs('Contadora', 'Bogotá', { serpApiKey: 'k', store, monthlyLimit: 230 });
    expect(first.jobs).toHaveLength(2);
    expect(store.searches()).toBe(1);

    clearExternalJobsCache(); // como si Render hubiera dormido el servicio
    const second = await searchExternalJobs('contador', 'bogota', { serpApiKey: 'k', store, monthlyLimit: 230 });
    expect(second.jobs).toHaveLength(2);
    expect(second.fetched_at).toBe(first.fetched_at);
    expect(calls('serpapi')).toBe(1);
    expect(store.searches()).toBe(1);
  });

  it('al llegar al tope mensual deja de consultar Google Jobs y no guarda el resultado incompleto', async () => {
    const store = fakeStore(230);
    const r = await searchExternalJobs('Contador', 'Bogotá', { serpApiKey: 'k', store, monthlyLimit: 230 });
    expect(calls('serpapi')).toBe(0);
    expect(r.jobs.map((j) => j.source)).toEqual(['getonbrd']);
    expect(r.sources).toContainEqual({ source: 'google_jobs', ok: false, count: 0, skipped: 'presupuesto' });
    expect(store.rows.size).toBe(0);
  });

  it('si un portal falla, devuelve lo guardado aunque esté vencido', async () => {
    const store = fakeStore();
    const old = { at: Date.now() - 3 * 24 * 60 * 60 * 1000, jobs: [{ id: 'gob:viejo', title: 'Contador' }] as never[], sources: [] as never[] };
    store.rows.set(cacheKeyOf('Contador', null), old);
    fetchMock.mockImplementation(async () => { throw new Error('caído'); });

    const r = await searchExternalJobs('Contador', null, { store });
    expect(r.jobs).toEqual(old.jobs);
  });

  it('una oferta vista antes de un reinicio se recupera de lo guardado', async () => {
    const store = fakeStore();
    await searchExternalJobs('Contador', null, { store });
    clearExternalJobsCache();
    expect((await findExternalJob('gob:contador-acme', store))?.title).toBe('Contador');
    expect(await findExternalJob('gob:no-existe', store)).toBeNull();
  });
});
