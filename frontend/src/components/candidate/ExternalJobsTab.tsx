'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { candidatePortalService, ExternalJob } from '../../services/candidatePortalService';
import { MatchBadge } from './MatchBadge';

const ago = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'publicada hoy' : d === 1 ? 'publicada ayer' : `publicada hace ${d} días`;
};

/** Ofertas publicadas en otros portales */
export const ExternalJobsTab = ({ onSelect }: { onSelect: (job: ExternalJob) => void }) => {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['external-jobs', query ?? ''],
    queryFn: () => candidatePortalService.externalJobs(query),
    staleTime: 10 * 60 * 1000,
  });

  const failed = data?.sources.filter((s) => !s.ok) ?? [];

  return (
    <>
      <form
        className="cand-toolbar"
        onSubmit={(e) => { e.preventDefault(); setQuery(draft.trim() || undefined); }}
        role="search"
      >
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={data?.query ? `Buscando: «${data.query}» (según tu perfil). Escribe otro cargo…` : 'Escribe el cargo que buscas'}
          aria-label="Buscar ofertas en otros sitios"
        />
        <button type="submit" className="btn-secondary-sm" disabled={isFetching}>{isFetching ? 'Buscando…' : 'Buscar'}</button>
      </form>

      <p className="ext-sources">
        Fuentes: <strong>Get on Board</strong>
        {data?.google_enabled ? <>, <strong>Google Jobs</strong> (elempleo, Computrabajo, LinkedIn y más)</> : ' · pronto más portales de Colombia'}
        . Te postulas en el sitio de cada oferta; aquí llevas el control.
      </p>

      {failed.length > 0 && (
        <p className="cp-note" role="status">Algunas fuentes no respondieron ahora; mostramos las demás. Vuelve a intentarlo en un rato.</p>
      )}
      {isError && <p className="form-error">{error instanceof Error ? error.message : 'No se pudieron cargar las ofertas'}</p>}

      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 100, marginBottom: 10 }} />)
      ) : !data?.query ? (
        <p className="dash-empty">Escribe el cargo que buscas o completa tu perfil (cargo o titular) para ver ofertas de otros sitios.</p>
      ) : data.jobs.length === 0 ? (
        <p className="dash-empty">No encontramos ofertas afines a «{data.query}» en otros sitios. Prueba con otro nombre del cargo.</p>
      ) : (
        <div className="cand-list">
          {data.jobs.map((j) => (
            <article key={j.id} className="cand-card">
              <div className="cand-card-main">
                <div className="cand-card-head">
                  <h2>{j.title}</h2>
                  <MatchBadge score={j.match.score} />
                  <span className="ext-badge">Externa · {j.source_label}</span>
                </div>
                <p className="cand-meta">
                  {[j.company, j.location, j.salary, ago(j.published_at)].filter(Boolean).join(' · ')}
                </p>
                {j.description && <p className="ext-snippet">{j.description.slice(0, 220)}{j.description.length > 220 ? '…' : ''}</p>}
              </div>
              <div className="cand-card-actions">
                {j.applied ? (
                  <>
                    <span className="badge badge-interviewed">Registrada</span>
                    <a href={j.url} target="_blank" rel="noopener noreferrer" className="result-link">Ver oferta ↗</a>
                  </>
                ) : (
                  <button type="button" className="btn-save" onClick={() => onSelect(j)}>Ver ajuste y postularme</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
};
