'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { candidatePortalService, JobSearchState, TrackedApp } from '../../services/candidatePortalService';
import { getStoredUser } from '../../lib/auth';

const STATES: { key: JobSearchState; label: string; tone: string }[] = [
  { key: 'sin_respuesta', label: 'Sin respuesta', tone: 'wait' },
  { key: 'en_proceso', label: 'En proceso', tone: 'progress' },
  { key: 'entrevista', label: 'Entrevista', tone: 'progress' },
  { key: 'avanza', label: 'Oferta / siguiente fase', tone: 'good' },
  { key: 'no_continua', label: 'No continúa', tone: 'bad' },
];
const STATE_LABEL = Object.fromEntries(STATES.map((s) => [s.key, s.label])) as Record<JobSearchState, string>;

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const shortWeek = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};

/**
 * Tablero "Mi búsqueda": cuánto lleva buscando, cuántas postulaciones ha enviado
 * (aquí y en otros sitios), cuáles cambiaron de estado, cuáles necesitan
 * seguimiento y su ritmo semana a semana.
 */
export const CandidateDashboardView = () => {
  const user = getStoredUser();
  const { data: d, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['candidate-dashboard'],
    queryFn: () => candidatePortalService.dashboard(),
  });

  const firstName = user?.full_name?.split(' ')[0] ?? '';
  const maxWeek = Math.max(1, ...(d?.weekly.map((w) => w.count) ?? [0]));
  const total = d?.totals.total ?? 0;

  return (
    <div className="dash cand-dash">
      <div className="page-header">
        <h1>Mi búsqueda</h1>
        <p>{firstName ? `Hola, ${firstName}. ` : ''}Así va tu búsqueda de empleo: aquí y en otros sitios.</p>
      </div>

      {isError && (
        <div className="dash-error" role="alert">
          <span>{error instanceof Error ? error.message : 'No se pudo cargar tu tablero.'}</span>
          <button type="button" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}

      {d && total === 0 && (
        <section className="dash-start" aria-labelledby="cand-start">
          <h2 id="cand-start">Empieza tu búsqueda</h2>
          <p>Aún no tienes postulaciones. En dos pasos empiezas a ver aquí tu avance.</p>
          <ol>
            <li>
              <strong>{d.has_cv ? 'Revisa tu perfil' : 'Sube tu hoja de vida'}</strong>
              <span>{d.has_cv ? `Tu perfil está ${Math.round((d.profile_strength.filled / d.profile_strength.total) * 100)} % completo. Con tu perfil completo, el porcentaje de cada vacante es más confiable.` : 'La IA llena tu perfil a partir de ella y tú revisas antes de guardar.'}</span>
              <Link href="/candidate/profile" className="btn-save">{d.has_cv ? 'Ir a mi perfil' : 'Subir mi HV'}</Link>
            </li>
            <li>
              <strong>Postúlate a las que más se ajustan</strong>
              <span>Vacantes de la plataforma y de otros sitios, ordenadas por qué tanto encajan contigo, con consejos para ajustar tu HV a cada una.</span>
              <Link href="/candidate/applications" className="btn-secondary-sm">Ver vacantes</Link>
            </li>
          </ol>
        </section>
      )}

      {(isLoading || total > 0) && (<>
        {/* ── Indicadores ─────────────────────────────────────── */}
        <section className="dash-section" aria-label="Indicadores">
          <ol className="dash-funnel">
            <li className="dash-step">
              <span className="dash-step-value">{isLoading || d?.searching_days == null ? '–' : d.searching_days === 0 ? 'Desde hoy' : days(d.searching_days)}</span>
              <span className="dash-step-label">Llevas buscando{d?.searching_since ? ` (desde el ${fmtDate(d.searching_since)})` : ''}</span>
            </li>
            <li className="dash-step">
              <span className="dash-step-value">{isLoading ? '–' : total}</span>
              <span className="dash-step-label">
                Postulaciones enviadas{d ? ` · ${d.totals.last_7d} esta semana, ${d.totals.last_30d} en 30 días` : ''}
              </span>
            </li>
            <li className="dash-step">
              <span className="dash-step-value">{isLoading || d?.response_rate == null ? '–' : `${d.response_rate} %`}</span>
              <span className="dash-step-label">Te respondieron (cambió el estado)</span>
            </li>
            <li className="dash-step">
              <span className="dash-step-value">{isLoading || d?.avg_days_to_response == null ? '–' : days(d.avg_days_to_response)}</span>
              <span className="dash-step-label">Tiempo promedio de respuesta</span>
            </li>
          </ol>
          {d && (
            <ul className="report-facts">
              <li>
                Última postulación {d.last_applied_days === 0 ? 'hoy' : d.last_applied_days === 1 ? 'ayer' : `hace ${d.last_applied_days} días`}.
                {d.last_applied_days !== null && d.last_applied_days >= 7 && <> Llevas una semana sin postularte: <Link href="/candidate/applications" className="result-link">mira las vacantes nuevas</Link>.</>}
              </li>
              <li>
                {d.totals.internal} en la plataforma y {d.totals.external} en otros sitios
                {d.avg_match !== null && <> · tu ajuste promedio con esas vacantes es <strong>{d.avg_match} %</strong></>}.
                {d.avg_match !== null && d.avg_match < 50 && ' Postularte a vacantes más afines suele traer más respuestas.'}
              </li>
              {total >= 5 && d.response_rate !== null && d.response_rate < 20 && (
                <li>Pocas respuestas hasta ahora: antes de cada postulación usa <strong>«Consejos de HV»</strong> para ajustar tu hoja de vida a lo que pide esa vacante.</li>
              )}
            </ul>
          )}
        </section>

        <div className="cand-dash-grid">
          {/* ── Ritmo semanal ─────────────────────────────────── */}
          <section className="dash-section" aria-labelledby="cand-weekly">
            <h2 id="cand-weekly">Postulaciones por semana</h2>
            <ol className="week-bars" aria-label="Postulaciones en las últimas 8 semanas">
              {d?.weekly.map((w, i) => (
                <li key={w.week_start} aria-label={`Semana del ${shortWeek(w.week_start)}: ${w.count}`}>
                  <span className="week-count">{w.count || ''}</span>
                  <span className="week-bar" style={{ height: `${Math.max(w.count ? 8 : 2, (w.count / maxWeek) * 100)}%` }} data-current={i === 7 || undefined} />
                  <span className="week-label">{i === 7 ? 'Esta' : shortWeek(w.week_start)}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Estados ───────────────────────────────────────── */}
          <section className="dash-section" aria-labelledby="cand-states">
            <h2 id="cand-states">Cómo van tus postulaciones</h2>
            <ul className="dash-sources">
              {STATES.map((s) => {
                const n = d?.by_state[s.key] ?? 0;
                return (
                  <li key={s.key} className="state-row">
                    <span className="dash-source-name">{s.label}</span>
                    <span className="dash-source-bar" aria-hidden="true">
                      <span className={`state-${s.tone}`} style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                    </span>
                    <span className="dash-source-text"><strong>{n}</strong></span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* ── Seguimiento ─────────────────────────────────────── */}
        <section className="dash-section" aria-labelledby="cand-follow">
          <div className="dash-section-head">
            <h2 id="cand-follow">Haz seguimiento</h2>
            <Link href="/candidate/applications" className="result-link">Ver mis postulaciones</Link>
          </div>
          {d && d.follow_up.length === 0 ? (
            <p className="dash-empty">Nada pendiente: ninguna postulación lleva 10 días o más sin respuesta.</p>
          ) : (
            <>
              <p className="dash-action-hint">Llevan 10 días o más sin respuesta. Escribe a la empresa o al reclutador, o si ya te respondieron, actualiza el estado.</p>
              <AppList items={d?.follow_up ?? []} detail={(a) => `Te postulaste hace ${days(a.days_since_applied)}`} />
            </>
          )}
        </section>

        {/* ── Cambios recientes ───────────────────────────────── */}
        <section className="dash-section" aria-labelledby="cand-changes">
          <h2 id="cand-changes">Cambios de estado recientes</h2>
          {d && d.recent_changes.length === 0 ? (
            <p className="dash-empty">Ningún cambio en las últimas dos semanas.</p>
          ) : (
            <AppList items={d?.recent_changes ?? []} detail={(a) => `${STATE_LABEL[a.state]} · ${a.changed_at ? ago(a.changed_at) : ''}`} />
          )}
        </section>
      </>)}
    </div>
  );
};

const AppList = ({ items, detail }: { items: TrackedApp[]; detail: (a: TrackedApp) => string }) => (
  <ul className="cand-dash-list">
    {items.map((a) => (
      <li key={`${a.kind}-${a.id}`}>
        <div>
          <span className="dash-person-name">{a.title}</span>
          <span className="dash-person-meta">
            {[a.company, a.kind === 'externa' ? `Externa · ${a.source ?? 'otro sitio'}` : 'En la plataforma'].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span className="cand-dash-detail">{detail(a)}</span>
      </li>
    ))}
  </ul>
);
