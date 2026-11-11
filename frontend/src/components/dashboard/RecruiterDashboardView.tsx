'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { dashboardService } from '../../services/dashboardService';
import { getStoredUser } from '../../lib/auth';
import {
  Candidate, CandidateSource, DashboardActionItem, DashboardFilters, DashboardFunnel, DashboardPeriod,
  RecruiterDashboard, SOURCE_LABELS, VacancyAlert,
} from '../../types';
import { CandidateProfileModal, ProfileTab } from '../chat/CandidateProfileModal';
import { PipelineTable } from './PipelineTable';
import { vacancyService } from '../../services/vacancyService';
import { Icon } from '../ui/Icon';

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: 'all', label: 'Todo' },
];

const FUNNEL_STEPS: { key: keyof DashboardFunnel; label: string }[] = [
  { key: 'candidates', label: 'Candidatos' },
  { key: 'contacted', label: 'Contactados' },
  { key: 'approved', label: 'Aprobados' },
  { key: 'hired', label: 'Autorizados' },
];

/** Qué significa cada alerta y qué hacer al respecto. */
const ALERTS: Record<VacancyAlert, { label: string; advice: (v: RecruiterDashboard['vacancies'][number]) => string }> = {
  vencida: { label: 'Vencida', advice: () => 'Venció sin nadie autorizado por la empresa: amplía la fecha o ciérrala.' },
  sin_candidatos: { label: 'Sin candidatos', advice: (v) => `${v.days_open} días abierta sin nadie: búscalos en el chat o comparte el enlace.` },
  vence_pronto: { label: 'Vence pronto', advice: (v) => `Vence en ${v.deadline_days} ${v.deadline_days === 1 ? 'día' : 'días'} y la empresa aún no autoriza a nadie.` },
  sin_contactar: { label: 'Sin contactar', advice: (v) => `Tiene ${v.candidates} ${v.candidates === 1 ? 'candidato' : 'candidatos'} y no has contactado a ninguno.` },
  sin_aprobados: { label: 'Sin aprobados', advice: (v) => `${v.candidates} candidatos y ningún aprobado: revisa si el perfil pedido es realista.` },
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const days = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`);

/** El paso del embudo donde más se pierde (solo si hubo con qué avanzar). */
function bottleneck(f: DashboardFunnel): { from: string; to: string; rate: number } | null {
  let worst: { from: string; to: string; rate: number } | null = null;
  for (let i = 1; i < FUNNEL_STEPS.length; i++) {
    const prev = f[FUNNEL_STEPS[i - 1].key];
    if (prev === 0) break;
    const rate = pct(f[FUNNEL_STEPS[i].key], prev);
    if (!worst || rate < worst.rate) worst = { from: FUNNEL_STEPS[i - 1].label, to: FUNNEL_STEPS[i].label, rate };
  }
  return worst;
}

export const RecruiterDashboardView = () => {
  const user = getStoredUser();
  const [filters, setFilters] = useState<DashboardFilters>({ period: '30d' });
  const [profile, setProfile] = useState<{ candidate: Candidate; tab: ProfileTab } | null>(null);

  // La clave ['candidate-stats'] ya la invalidan el Kanban, la tabla y el modal de candidatos por vacante
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['candidate-stats', filters],
    queryFn: () => dashboardService.recruiter(filters),
    refetchInterval: 60000,
  });

  const open = (item: DashboardActionItem, tab: ProfileTab) =>
    setProfile({
      candidate: { id: item.id, kind: item.kind, full_name: item.full_name, position: item.title ?? '' } as Candidate,
      tab,
    });

  const funnel = data?.funnel;
  const weak = funnel ? bottleneck(funnel) : null;
  // Reclutador que recién empieza: sin candidatos ni vacantes (y sin filtros que lo expliquen)
  const isEmpty = !!data && !filters.vacancyId && !filters.source
    && data.pipeline.total === 0 && data.vacancy_options.length === 0;

  return (
    <div className="dash">
      {profile && (
        <CandidateProfileModal
          key={profile.candidate.id}
          candidate={profile.candidate}
          initialTab={profile.tab}
          onClose={() => { setProfile(null); refetch(); }}
        />
      )}

      <div className="page-header dash-head">
        <div>
          <h1>Dashboard</h1>
          <p>Hola, <strong style={{ color: 'var(--text-1)' }}>{user?.full_name ?? 'Usuario'}</strong>. Esto es lo que necesita tu atención.</p>
        </div>
        <div className="dash-filters" role="group" aria-label="Filtros">
          <span className="dash-filters-title" aria-hidden="true"><Icon name="sliders" size={14} /> Filtros</span>
          <label className="dash-filter">
            <Icon name="calendar" size={14} className="dash-filter-icon" />
            <span className="sr-only">Periodo</span>
            <select value={filters.period} onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value as DashboardPeriod }))} aria-label="Periodo">
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <Icon name="chevronDown" size={14} className="dash-filter-chevron" />
          </label>
          <label className="dash-filter">
            <Icon name="briefcase" size={14} className="dash-filter-icon" />
            <span className="sr-only">Vacante</span>
            <select value={filters.vacancyId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, vacancyId: e.target.value || undefined }))} aria-label="Vacante">
              <option value="">Todas las vacantes</option>
              {data?.vacancy_options.map((v) => (
                <option key={v.id} value={v.id}>{v.title}{v.status === 'paused' ? ' (pausada)' : ''}</option>
              ))}
            </select>
            <Icon name="chevronDown" size={14} className="dash-filter-chevron" />
          </label>
          <label className="dash-filter">
            <Icon name="compass" size={14} className="dash-filter-icon" />
            <span className="sr-only">Origen</span>
            <select value={filters.source ?? ''} onChange={(e) => setFilters((f) => ({ ...f, source: (e.target.value || undefined) as CandidateSource | undefined }))} aria-label="Origen">
              <option value="">Todos los orígenes</option>
              {(Object.keys(SOURCE_LABELS) as CandidateSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
            <Icon name="chevronDown" size={14} className="dash-filter-chevron" />
          </label>
        </div>
      </div>

      {isError && (
        <div className="dash-error" role="alert">
          <span>{error instanceof Error ? error.message : 'No se pudieron cargar los datos.'}</span>
          <button type="button" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}

      {isEmpty && (
        <section className="dash-start" aria-labelledby="dash-start">
          <h2 id="dash-start">Empieza aquí</h2>
          <p>Todavía no tienes candidatos ni vacantes. Con estos dos pasos el dashboard empieza a mostrarte a quién contactar y qué decidir.</p>
          <ol>
            <li>
              <strong>Busca candidatos en el chat</strong>
              <span>Escríbelo como se lo pedirías a un colega: «contadora en Bogotá con NIIF, hasta 4 millones». Si no hay en tu base, se buscan en fuentes externas.</span>
              <Link href="/chat" className="btn-save">Buscar candidatos</Link>
            </li>
            <li>
              <strong>Crea tu primera vacante</strong>
              <span>Descríbela con tus palabras y la IA llena el formulario; tú revisas y confirmas. Aprobar y dar seguimiento se hace dentro de una vacante.</span>
              <Link href="/vacancies" className="btn-secondary-sm">Crear vacante</Link>
            </li>
          </ol>
        </section>
      )}

      {!isEmpty && (<>
      {/* ── Embudo ───────────────────────────────────────────── */}
      <section className="dash-section" aria-labelledby="dash-funnel">
        <h2 id="dash-funnel">Embudo de selección</h2>
        <ol className="dash-funnel">
          {FUNNEL_STEPS.map((step, i) => {
            const value = funnel?.[step.key] ?? 0;
            const prev = i > 0 ? funnel?.[FUNNEL_STEPS[i - 1].key] ?? 0 : null;
            return (
              <li key={step.key} className="dash-step">
                {prev !== null && (
                  <span className="dash-step-rate" aria-label={`${pct(value, prev)} % de ${FUNNEL_STEPS[i - 1].label.toLowerCase()}`}>
                    {pct(value, prev)} %
                  </span>
                )}
                <span className="dash-step-value">{isLoading ? '–' : value}</span>
                <span className="dash-step-label">{step.label}</span>
              </li>
            );
          })}
        </ol>
        {weak && funnel && funnel.candidates > 0 && (
          <p className="dash-insight">
            Donde más se pierden candidatos: de <strong>{weak.from.toLowerCase()}</strong> a <strong>{weak.to.toLowerCase()}</strong> (solo {weak.rate} % avanza).
            {funnel.rejected > 0 && <> {funnel.rejected} {funnel.rejected === 1 ? 'fue rechazado' : 'fueron rechazados'} en el periodo.</>}
          </p>
        )}
      </section>

      {/* ── Qué hacer hoy ────────────────────────────────────── */}
      <section className="dash-section" aria-labelledby="dash-today">
        <h2 id="dash-today">Qué hacer hoy</h2>
        <div className="dash-actions">
          <ActionList
            title="Recontactar o decidir"
            hint="Les escribiste hace 3 días o más y no han avanzado."
            data={data?.actions.follow_up}
            loading={isLoading}
            detail={(i) => `Contactado ${days(i.days)}`}
            actionLabel="Contactar"
            onAction={(i) => open(i, 'contactar')}
            onOpen={(i) => open(i, 'perfil')}
          />
          <ActionList
            title="Postulaciones sin revisar"
            hint="Se postularon y nadie ha mirado su hoja de vida."
            data={data?.actions.new_applicants}
            loading={isLoading}
            detail={(i) => `Se postuló ${days(i.days)}`}
            actionLabel="Revisar"
            onAction={(i) => open(i, 'perfil')}
            onOpen={(i) => open(i, 'perfil')}
          />
          <ActionList
            title="La empresa no ha decidido"
            hint="Aprobados hace 5 días o más sin respuesta de la empresa."
            data={data?.actions.awaiting_company}
            loading={isLoading}
            detail={(i) => `Aprobado ${days(i.days)}`}
            onOpen={(i) => open(i, 'perfil')}
          />
        </div>
      </section>

      {/* ── Quién está en qué etapa ──────────────────────────── */}
      <section className="dash-section" aria-labelledby="dash-pipeline">
        <h2 id="dash-pipeline">Candidatos por etapa</h2>
        <PipelineTable
          data={data?.pipeline}
          loading={isLoading}
          onOpen={(row, tab) => open({ ...row, days: row.days ?? 0 }, tab)}
          vacancies={data?.vacancy_options.filter((v) => v.status === 'active')}
          onLink={async (row, vacancyId) => {
            try {
              const r = await vacancyService.linkCandidates(vacancyId, [{ kind: row.kind, id: row.id }]);
              if (r.linked.length) { refetch(); return null; }
              const reason = r.skipped[0]?.reason;
              return reason === 'cuenta_propia' ? 'Tiene cuenta propia: compártele el enlace de la vacante'
                : reason === 'otra_vacante' ? 'Ya está en otra vacante'
                : reason === 'rechazado' ? 'Está rechazado para esa vacante'
                : 'No se pudo asociar';
            } catch (err) {
              return err instanceof Error ? err.message : 'No se pudo asociar';
            }
          }}
        />
      </section>

      {/* ── Vacantes ─────────────────────────────────────────── */}
      <section className="dash-section" aria-labelledby="dash-vacancies">
        <div className="dash-section-head">
          <h2 id="dash-vacancies">Vacantes activas</h2>
          <Link href="/vacancies" className="result-link">Gestionar vacantes</Link>
        </div>
        {!isLoading && (data?.vacancies.length ?? 0) === 0 ? (
          <p className="dash-empty">
            No hay vacantes activas{filters.vacancyId ? ' con este filtro' : ''}. <Link href="/vacancies" className="result-link">Crea una</Link> (puedes describirla con tus palabras).
          </p>
        ) : (
          <div className="candidate-table-wrapper">
            <table className="candidate-table dash-vacancy-table">
              <thead>
                <tr>
                  <th>Vacante</th>
                  <th className="num">Candidatos</th>
                  <th className="num">Contactados</th>
                  <th className="num">Aprobados</th>
                  <th className="num">Autorizados</th>
                  <th>Qué hacer</th>
                </tr>
              </thead>
              <tbody>
                {data?.vacancies.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="dash-vacancy-title">{v.title}</span>
                      <span className="dash-vacancy-meta">abierta hace {v.days_open} {v.days_open === 1 ? 'día' : 'días'}</span>
                    </td>
                    <td className="num">{v.candidates}</td>
                    <td className="num">{v.contacted}</td>
                    <td className="num">{v.approved}</td>
                    <td className="num">{v.hired}</td>
                    <td>
                      {v.alert ? (
                        <div className="dash-alert">
                          <span className={`dash-alert-tag ${v.alert}`}>{ALERTS[v.alert].label}</span>
                          <span>{ALERTS[v.alert].advice(v)}</span>
                          {v.alert === 'sin_candidatos' && (
                            <Link href={`/chat?q=${encodeURIComponent(v.title)}`} className="result-link">Buscar en el chat</Link>
                          )}
                        </div>
                      ) : (
                        <span className="dash-ok">Al día</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Orígenes ─────────────────────────────────────────── */}
      {(data?.sources.length ?? 0) > 0 && (
        <section className="dash-section" aria-labelledby="dash-sources">
          <h2 id="dash-sources">¿De dónde salen los que avanzan?</h2>
          <ul className="dash-sources">
            {data!.sources.map((s) => (
              <li key={s.source}>
                <span className="dash-source-name">{SOURCE_LABELS[s.source]}</span>
                <span className="dash-source-bar" aria-hidden="true">
                  <span style={{ width: `${pct(s.approved, s.candidates)}%` }} />
                </span>
                <span className="dash-source-text">
                  {s.candidates} candidatos · {pct(s.contacted, s.candidates)} % contactados · <strong>{pct(s.approved, s.candidates)} % aprobados</strong>
                  {s.hired > 0 && <> · {s.hired} autorizado{s.hired === 1 ? '' : 's'}</>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </>)}
    </div>
  );
};

const ActionList = ({ title, hint, data, loading, detail, actionLabel, onAction, onOpen }: {
  title: string;
  hint: string;
  data?: { total: number; items: DashboardActionItem[] };
  loading: boolean;
  detail: (i: DashboardActionItem) => string;
  actionLabel?: string;
  onAction?: (i: DashboardActionItem) => void;
  onOpen: (i: DashboardActionItem) => void;
}) => (
  <div className="dash-action-card">
    <div className="dash-action-head">
      <h3>{title}</h3>
      <span className={`dash-count${data?.total ? ' has' : ''}`}>{loading ? '–' : data?.total ?? 0}</span>
    </div>
    <p className="dash-action-hint">{hint}</p>
    {!loading && data?.items.length === 0 ? (
      <p className="dash-empty">Nada pendiente.</p>
    ) : (
      <ul>
        {data?.items.map((i) => (
          <li key={`${i.kind}-${i.id}-${i.vacancy_title ?? ''}`}>
            <button type="button" className="dash-person" onClick={() => onOpen(i)}>
              <span className="dash-person-name">{i.full_name}</span>
              <span className="dash-person-meta">
                {[i.title, i.vacancy_title, detail(i)].filter(Boolean).join(' · ')}
              </span>
            </button>
            {actionLabel && onAction && (
              <button type="button" className="btn-secondary-sm" onClick={() => onAction(i)}>{actionLabel}</button>
            )}
          </li>
        ))}
      </ul>
    )}
    {data && data.total > data.items.length && (
      <p className="dash-more">y {data.total - data.items.length} más</p>
    )}
  </div>
);
