import { createHash } from 'node:crypto';

/**
 * Ofertas de empleo de otros sitios web para el portal del candidato. El
 * candidato se postula EN EL SITIO de origen (no aquí); la plataforma solo le
 * muestra la oferta, cuánto se ajusta a su perfil y le lleva el control.
 *
 * Fuentes:
 *  - Get on Board (API pública, sin clave): LATAM, sobre todo tecnología y negocios.
 *  - Google Jobs vía SerpApi (si hay SERPAPI_API_KEY): agrega elempleo,
 *    Computrabajo, LinkedIn y demás portales de Colombia, de todos los sectores.
 *
 * Cada fuente que falle se omite (las demás siguen). Los resultados se guardan
 * en memoria unas horas: las ofertas no cambian minuto a minuto y SerpApi cobra
 * por búsqueda.
 */

export type ExternalSource = 'getonbrd' | 'google_jobs';

export interface ExternalJob {
  id: string;
  source: ExternalSource;
  /** Dónde está publicada, para mostrar ("Get on Board", "elempleo.com"). */
  source_label: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  /** Página de la oferta en su sitio: ahí se postula. */
  url: string;
  published_at: string | null;
  salary: string | null;
  /** Texto plano, recortado: sirve para calcular el ajuste y los consejos de HV. */
  description: string;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_DESCRIPTION = 2500;
const MAX_KNOWN_JOBS = 3000;

const cache = new Map<string, { at: number; jobs: ExternalJob[] }>();
/** Ofertas vistas recientemente, por id: los consejos de HV se piden por id, no con texto del navegador. */
const known = new Map<string, ExternalJob>();

const stripHtml = (html: string | null | undefined) =>
  (html ?? '')
    .replace(/<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

const safeUrl = (u: unknown): string | null => {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Get on Board ──────────────────────────────────────────────────────────

interface GobJob {
  id: string;
  links?: { public_url?: string };
  attributes: {
    title: string; description?: string; functions?: string; desirable?: string;
    remote_modality?: string; countries?: string[]; min_salary?: number | null; max_salary?: number | null;
    published_at?: number; company?: { data?: { attributes?: { name?: string } } };
  };
}

const usd = (n: number) => `US$${n.toLocaleString('es-CO')}`;

export function normalizeGetOnBoard(raw: unknown): ExternalJob[] {
  const data = ((raw as { data?: GobJob[] })?.data ?? []);
  return data.flatMap((j) => {
    const a = j.attributes;
    const url = safeUrl(j.links?.public_url);
    if (!url || !a?.title) return [];
    const countries = a.countries ?? [];
    const remote = a.remote_modality === 'fully_remote' || countries.includes('Remote');
    // Solo lo que puede tomar alguien en Colombia
    if (!countries.includes('Colombia') && !remote) return [];
    const salary = a.min_salary && a.max_salary ? `${usd(a.min_salary)} – ${usd(a.max_salary)} / mes`
      : a.min_salary || a.max_salary ? `${usd((a.min_salary || a.max_salary)!)} / mes` : null;
    const modality = a.remote_modality === 'hybrid' ? ' · híbrido' : a.remote_modality === 'no_remote' ? ' · presencial' : '';
    return [{
      id: `gob:${j.id}`,
      source: 'getonbrd' as const,
      source_label: 'Get on Board',
      title: a.title.trim(),
      company: a.company?.data?.attributes?.name?.trim() || null,
      location: remote ? 'Remoto' : `${countries.filter((c) => c !== 'Remote').join(', ')}${modality}`,
      remote,
      url,
      published_at: a.published_at ? new Date(a.published_at * 1000).toISOString() : null,
      salary,
      description: stripHtml([a.description, a.functions, a.desirable].filter(Boolean).join('\n')).slice(0, MAX_DESCRIPTION),
    }];
  });
}

async function fromGetOnBoard(query: string): Promise<ExternalJob[]> {
  const url = new URL('https://www.getonbrd.com/api/v0/search/jobs');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '40');
  url.searchParams.set('expand', '["company"]');
  return normalizeGetOnBoard(await fetchJson(url.toString()));
}

// ─── Google Jobs (SerpApi) ─────────────────────────────────────────────────

interface GoogleJob {
  job_id?: string; title?: string; company_name?: string; location?: string; via?: string; description?: string;
  share_link?: string; apply_options?: { title?: string; link?: string }[];
  detected_extensions?: { posted_at?: string; work_from_home?: boolean; salary?: string };
}

/** "hace 3 días" → fecha aproximada (Google no da la fecha exacta). */
function postedAt(text: string | undefined, now: Date): string | null {
  const m = text?.match(/(\d+)\s*(hora|día|dia|semana|mes)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const hours = unit.startsWith('hora') ? n : unit.startsWith('d') ? n * 24 : unit.startsWith('semana') ? n * 24 * 7 : n * 24 * 30;
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export function normalizeGoogleJobs(raw: unknown, now = new Date()): ExternalJob[] {
  const jobs = ((raw as { jobs_results?: GoogleJob[] })?.jobs_results ?? []);
  return jobs.flatMap((j) => {
    // Se prefiere el enlace directo al portal donde se postula
    const apply = j.apply_options?.find((o) => safeUrl(o.link));
    const url = safeUrl(apply?.link) ?? safeUrl(j.share_link);
    if (!url || !j.title) return [];
    const label = (apply?.title ?? j.via ?? 'Google Jobs').replace(/^(a través de|via|vía)\s+/i, '').trim();
    return [{
      id: `gj:${createHash('sha1').update(j.job_id ?? url).digest('hex').slice(0, 20)}`,
      source: 'google_jobs' as const,
      source_label: label || 'Google Jobs',
      title: j.title.trim(),
      company: j.company_name?.trim() || null,
      location: j.location?.trim() || null,
      remote: !!j.detected_extensions?.work_from_home,
      url,
      published_at: postedAt(j.detected_extensions?.posted_at, now),
      salary: j.detected_extensions?.salary ?? null,
      description: stripHtml(j.description).slice(0, MAX_DESCRIPTION),
    }];
  });
}

async function fromGoogleJobs(query: string, location: string | null, apiKey: string): Promise<ExternalJob[]> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_jobs');
  url.searchParams.set('q', query);
  url.searchParams.set('location', location ? `${location}, Colombia` : 'Colombia');
  url.searchParams.set('hl', 'es');
  url.searchParams.set('gl', 'co');
  url.searchParams.set('api_key', apiKey);
  const raw = await fetchJson(url.toString()) as { error?: string };
  // "Google hasn't returned any results" no es un fallo: simplemente no hay ofertas
  if (raw.error && !/hasn't returned any results/i.test(raw.error)) throw new Error(raw.error);
  return normalizeGoogleJobs(raw);
}

// ─── Búsqueda combinada ────────────────────────────────────────────────────

export interface ExternalSearch {
  jobs: ExternalJob[];
  /** Fuentes consultadas y si respondieron. */
  sources: { source: ExternalSource; ok: boolean; count: number }[];
}

export async function searchExternalJobs(
  query: string,
  location: string | null,
  opts: { serpApiKey?: string; onError?: (source: ExternalSource, err: unknown) => void } = {}
): Promise<ExternalSearch> {
  const key = `${query.toLowerCase().trim()}|${(location ?? '').toLowerCase().trim()}|${opts.serpApiKey ? 'g' : ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { jobs: hit.jobs, sources: [...new Set(hit.jobs.map((j) => j.source))].map((s) => ({ source: s, ok: true, count: hit.jobs.filter((j) => j.source === s).length })) };
  }

  const providers: [ExternalSource, () => Promise<ExternalJob[]>][] = [['getonbrd', () => fromGetOnBoard(query)]];
  if (opts.serpApiKey) providers.push(['google_jobs', () => fromGoogleJobs(query, location, opts.serpApiKey!)]);

  const results = await Promise.all(providers.map(async ([source, run]) => {
    try {
      const jobs = await run();
      return { source, ok: true, jobs };
    } catch (err) {
      opts.onError?.(source, err);
      return { source, ok: false, jobs: [] as ExternalJob[] };
    }
  }));

  // La misma oferta puede estar en varias fuentes: una vez por título + empresa
  const seen = new Set<string>();
  const jobs = results.flatMap((r) => r.jobs).filter((j) => {
    const k = `${j.title}|${j.company ?? ''}`.toLowerCase();
    return !seen.has(k) && seen.add(k);
  });

  // Si alguna fuente falló no se guarda en caché: se reintenta en la próxima visita
  if (results.every((r) => r.ok)) cache.set(key, { at: Date.now(), jobs });
  for (const j of jobs) known.set(j.id, j);
  while (known.size > MAX_KNOWN_JOBS) known.delete(known.keys().next().value as string);

  return { jobs, sources: results.map((r) => ({ source: r.source, ok: r.ok, count: r.jobs.length })) };
}

/** Oferta externa vista recientemente (null si ya salió de la memoria). */
export const findExternalJob = (id: string): ExternalJob | null => known.get(id) ?? null;

/** Solo para pruebas. */
export const clearExternalJobsCache = () => { cache.clear(); known.clear(); };
