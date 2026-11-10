'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { dashboardService } from '../../services/dashboardService';
import { getStoredUser } from '../../lib/auth';
import { Candidate, CompanyDashboard, PipelineRow, VacancyAlert } from '../../types';
import { CandidateProfileModal } from '../chat/CandidateProfileModal';
import { CompanyDecisionControl } from './CompanyDecisionControl';

/** Días sin respuesta a partir de los cuales el candidato puede irse con otra empresa. */
const SLOW_DAYS = 5;

const waited = (n: number | null) => (n === null ? '—' : n === 0 ? 'hoy' : n === 1 ? '1 día' : `${n} días`);
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—';
const lastSeen = (iso: string | null) => {
  if (!iso) return 'Nunca ha entrado';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'Entró hoy' : d === 1 ? 'Entró ayer' : `Entró hace ${d} días`;
};

/** Las alertas de vacante, contadas desde la empresa (no es ella quien busca). */
const ALERTS: Record<VacancyAlert, { label: string; advice: (v: CompanyDashboard['vacancies'][number]) => string }> = {
  vencida: { label: 'Vencida', advice: () => 'Pasó la fecha límite sin nadie autorizado: amplíala o ciérrala.' },
  sin_candidatos: { label: 'Sin candidatos', advice: (v) => `${v.days_open} días abierta y tu equipo aún no tiene candidatos.` },
  vence_pronto: { label: 'Vence pronto', advice: (v) => `Vence en ${v.deadline_days} ${v.deadline_days === 1 ? 'día' : 'días'} y aún no autorizas a nadie.` },
  sin_contactar: { label: 'Sin contactar', advice: (v) => `Hay ${v.candidates} ${v.candidates === 1 ? 'candidato' : 'candidatos'} y nadie los ha contactado.` },
  sin_aprobados: { label: 'Sin aprobados', advice: (v) => `${v.candidates} candidatos y ninguno aprobado: quizá el perfil pedido es muy exigente.` },
};

const asCandidate = (r: PipelineRow) =>
  ({ id: r.id, kind: r.kind, full_name: r.full_name, position: r.title ?? '' } as Candidate);

/**
 * Dashboard de la empresa: qué decisiones le tocan (y desde cuándo), cómo van
 * sus vacantes y qué hace su equipo de reclutamiento. Solo muestra candidatos
 * que un reclutador ya presentó (GET /api/company/dashboard).
 */
export const EmpresaDashboardView = () => {
  const user = getStoredUser();
  const [profile, setProfile] = useState<PipelineRow | null>(null);

  // ['company-dashboard'] lo invalida CompanyDecisionControl al decidir
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['company-dashboard'],
    queryFn: () => dashboardService.company(),
    refetchInterval: 60000,
  });

  const k = data?.kpis;
  const isEmpty = !!data && data.pending.length === 0 && data.recent_decisions.length === 0
    && data.vacancies.length === 0 && data.team.length === 0;

  return (
    <div className="dash">
      {profile && (
        <CandidateProfileModal readOnly candidate={asCandidate(profile)} onClose={() => setProfile(null)} />
      )}

      <div className="page-header">
        <h1>Dashboard</h1>
        <p>
          Hola, <strong style={{ color: 'var(--text-1)' }}>{user?.full_name ?? 'Usuario'}</strong>.{' '}
          {k?.pending ? `Tienes ${k.pending} ${k.pending === 1 ? 'candidato esperando' : 'candidatos esperando'} tu decisión.` : 'Esto es lo que pasa con tus vacantes y tu equipo.'}
        </p>
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
          <p>Tus reclutadores buscan y filtran; tú decides quién pasa a la siguiente fase de tu proceso. Para arrancar:</p>
          <ol>
            <li>
              <strong>Crea tu equipo de reclutamiento</strong>
              <span>Dale una cuenta a cada reclutador. Lo que contacten y aprueben aparecerá aquí.</span>
              <Link href="/recruiters" className="btn-save">Agregar reclutador</Link>
            </li>
            <li>
              <strong>Publica tu primera vacante</strong>
              <span>Descríbela con tus palabras y la IA llena el formulario. Tu equipo buscará candidatos para ella.</span>
              <Link href="/vacancies" className="btn-secondary-sm">Crear vacante</Link>
            </li>
          </ol>
        </section>
      )}

      {!isEmpty && (<>
      {/* ── Indicadores ──────────────────────────────────────── */}
      <section className="dash-section" aria-label="Indicadores">
        <ol className="dash-funnel">
          <li className="dash-step">
            <span className="dash-step-value" style={{ color: k?.pending ? 'var(--yellow)' : undefined }}>{isLoading ? '–' : k?.pending ?? 0}</span>
            <span className="dash-step-label">Esperan tu decisión</span>
          </li>
          <li className="dash-step">
            <span className="dash-step-value" style={{ color: 'var(--green)' }}>{isLoading ? '–' : k?.hired ?? 0}</span>
            <span className="dash-step-label">Autorizados a siguiente fase</span>
          </li>
          <li className="dash-step">
            <span className="dash-step-value">{isLoading ? '–' : k?.discarded ?? 0}</span>
            <span className="dash-step-label">Descartados</span>
          </li>
          <li className="dash-step">
            <span className="dash-step-value">{isLoading ? '–' : k?.avg_days_to_decide ?? '—'}</span>
            <span className="dash-step-label">Días promedio en responder</span>
          </li>
        </ol>
        {k && k.oldest_pending_days !== null && k.oldest_pending_days >= SLOW_DAYS && (
          <p className="dash-insight">
            El candidato más antiguo lleva <strong>{waited(k.oldest_pending_days)}</strong> esperando respuesta. Los buenos candidatos suelen aceptar otra oferta si pasa más de una semana.
          </p>
        )}
      </section>

      {/* ── Necesitan tu decisión ────────────────────────────── */}
      <section className="dash-section" aria-labelledby="dash-pending">
        <div className="dash-section-head">
          <h2 id="dash-pending">Necesitan tu decisión</h2>
          <Link href="/candidates" className="result-link">Ver todos los candidatos</Link>
        </div>
        {!isLoading && (data?.pending.length ?? 0) === 0 ? (
          <p className="dash-empty">No tienes decisiones pendientes. Cuando un reclutador apruebe a alguien para tu empresa aparecerá aquí.</p>
        ) : (
          <div className="candidate-table-wrapper">
            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th>Vacante</th>
                  <th>Presentado por</th>
                  <th className="num">Esperando</th>
                  <th>Tu decisión</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="skeleton-row">{Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}</tr>
                    ))
                  : data!.pending.map((r) => (
                      <tr key={`${r.kind}-${r.id}`}>
                        <td>
                          <button type="button" className="dash-person" onClick={() => setProfile(r)} aria-label={`Ver perfil de ${r.full_name}`}>
                            <span className="dash-person-name">{r.full_name}</span>
                            {r.title && <span className="dash-person-meta">{r.title}</span>}
                          </button>
                        </td>
                        <td>{r.vacancy_title ?? <span style={{ color: 'var(--text-3)' }}>Sin vacante</span>}</td>
                        <td>{r.event.by ?? '—'}</td>
                        <td className="num" style={{ color: (r.days ?? 0) >= SLOW_DAYS ? 'var(--yellow)' : undefined, fontWeight: (r.days ?? 0) >= SLOW_DAYS ? 600 : undefined }}>
                          {waited(r.days)}
                        </td>
                        <td><CompanyDecisionControl candidate={{ kind: r.kind, id: r.id, full_name: r.full_name }} decision="pendiente" /></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Vacantes ─────────────────────────────────────────── */}
      <section className="dash-section" aria-labelledby="dash-vacancies">
        <div className="dash-section-head">
          <h2 id="dash-vacancies">Tus vacantes activas{k ? ` (${k.active_vacancies})` : ''}</h2>
          <Link href="/vacancies" className="result-link">Gestionar vacantes</Link>
        </div>
        {!isLoading && (data?.vacancies.length ?? 0) === 0 ? (
          <p className="dash-empty">No tienes vacantes activas. <Link href="/vacancies" className="result-link">Crea una</Link> para que tu equipo busque candidatos.</p>
        ) : (
          <div className="candidate-table-wrapper">
            <table className="candidate-table dash-vacancy-table">
              <thead>
                <tr>
                  <th>Vacante</th>
                  <th className="num">Candidatos</th>
                  <th className="num">Contactados</th>
                  <th className="num">Presentados</th>
                  <th className="num">Autorizados</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data?.vacancies.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="dash-vacancy-title">{v.title}</span>
                      <span className="dash-vacancy-meta">
                        abierta hace {v.days_open} {v.days_open === 1 ? 'día' : 'días'}
                        {v.deadline_days !== null && v.deadline_days >= 0 && ` · cierra en ${v.deadline_days} ${v.deadline_days === 1 ? 'día' : 'días'}`}
                      </span>
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
                        </div>
                      ) : v.hired > 0 ? (
                        <span className="dash-ok">Con autorizados</span>
                      ) : (
                        <span className="dash-ok">Avanzando</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Equipo ───────────────────────────────────────────── */}
      <section className="dash-section" aria-labelledby="dash-team">
        <div className="dash-section-head">
          <h2 id="dash-team">Tu equipo de reclutamiento</h2>
          <Link href="/recruiters" className="result-link">Gestionar equipo</Link>
        </div>
        {!isLoading && (data?.team.length ?? 0) === 0 ? (
          <p className="dash-empty">Aún no tienes reclutadores. <Link href="/recruiters" className="result-link">Agrega uno</Link> para que busquen candidatos por ti.</p>
        ) : (
          <div className="candidate-table-wrapper">
            <table className="candidate-table dash-vacancy-table">
              <thead>
                <tr>
                  <th>Reclutador</th>
                  <th className="num" title="Contactos por WhatsApp, correo o LinkedIn en los últimos 30 días">Contactados (30 días)</th>
                  <th className="num">Te presentó</th>
                  <th className="num">Autorizaste</th>
                  <th className="num" title="De los que te presentó, cuántos autorizaste para la siguiente fase">Acierto</th>
                </tr>
              </thead>
              <tbody>
                {data?.team.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="dash-vacancy-title">{m.full_name}</span>
                      <span className="dash-vacancy-meta">{m.suspended ? 'Suspendido' : lastSeen(m.last_login)}</span>
                    </td>
                    <td className="num">{m.contacted_30d}</td>
                    <td className="num">{m.presented}</td>
                    <td className="num">{m.hired}</td>
                    <td className="num">{m.hire_rate === null ? '—' : `${m.hire_rate} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Últimas decisiones ───────────────────────────────── */}
      {(data?.recent_decisions.length ?? 0) > 0 && (
        <section className="dash-section" aria-labelledby="dash-decisions">
          <h2 id="dash-decisions">Tus últimas decisiones</h2>
          <ul className="dash-sources">
            {data!.recent_decisions.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="dash-decision">
                <button type="button" className="dash-person" onClick={() => setProfile(r)} aria-label={`Ver perfil de ${r.full_name}`}>
                  <span className="dash-person-name">{r.full_name}</span>
                  <span className="dash-person-meta">{r.vacancy_title ?? r.title ?? 'Sin vacante'}</span>
                </button>
                <span className={`badge ${r.stage === 'contratado' ? 'badge-hired' : 'badge-rejected'}`}>
                  {r.stage === 'contratado' ? 'Autorizado' : 'Descartado'}
                </span>
                <span className="dash-source-text">
                  {fmtDate(r.event.at)}{r.event.reason ? <> · «{r.event.reason}»</> : r.stage !== 'contratado' ? ' · sin motivo' : ''}
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
