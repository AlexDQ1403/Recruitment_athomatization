'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportService, CompanyReport } from '../../services/reportService';
import { getStoredUser } from '../../lib/auth';
import { ContactedActivity } from './ContactedActivity';

type PresetKey = 'this_month' | 'last_month' | '30d' | '90d' | 'this_year' | 'custom';

/** Hoy en Colombia (UTC-5) como 'YYYY-MM-DD'. */
const todayCO = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const shift = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function presetRange(key: Exclude<PresetKey, 'custom'>): { from: string; to: string } {
  const today = todayCO();
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (key) {
    case 'this_month': return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last_month': {
      const firstThis = `${y}-${pad(m)}-01`;
      const lastPrev = shift(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case '30d': return { from: shift(today, -29), to: today };
    case '90d': return { from: shift(today, -89), to: today };
    case 'this_year': return { from: `${y}-01-01`, to: today };
  }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes pasado' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: '90d', label: 'Últimos 90 días' },
  { key: 'this_year', label: 'Este año' },
  { key: 'custom', label: 'Personalizado' },
];

const fmtDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : '—');
const daysText = (n: number | null) => (n === null ? '—' : n < 1 ? 'menos de 1 día' : `${n} ${n === 1 ? 'día' : 'días'}`);
const STATUS: Record<string, string> = { active: 'Activa', paused: 'Pausada', closed: 'Cerrada' };

/** Reportes de la empresa */
export const ReportsView = () => {
  const user = getStoredUser();
  const [tab, setTab] = useState<'results' | 'activity'>('results');
  const [preset, setPreset] = useState<PresetKey>('this_month');
  const [custom, setCustom] = useState(() => presetRange('30d'));

  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset)), [preset, custom]);
  const validRange = !!range.from && !!range.to && range.from <= range.to;

  const { data, isLoading, error } = useQuery<CompanyReport>({
    queryKey: ['report-results', range.from, range.to],
    queryFn: () => reportService.getResults(range.from, range.to),
    enabled: tab === 'results' && validRange,
  });

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([`﻿${reportService.resultsToCsv(data, range.from, range.to)}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-resultados-${range.from}-a-${range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const t = data?.totals;
  const topReason = data?.discard_reasons[0];
  const empty = !!t && t.found + t.contacted + t.presented + t.authorized + t.discarded === 0;

  return (
    <div className="report">
      <div className="page-header dash-head">
        <div>
          <h1>Reportes</h1>
          <p>Resultados de tu equipo para presentar o compartir.</p>
        </div>
        {tab === 'results' && (
          <div className="dash-filters no-print">
            <button type="button" className="btn-secondary-sm" onClick={() => window.print()} disabled={!data}>Imprimir / PDF</button>
            <button type="button" className="btn-save" onClick={exportCsv} disabled={!data}>Exportar CSV</button>
          </div>
        )}
      </div>

      <div className="cp-tabs no-print" role="tablist" style={{ marginBottom: 20 }}>
        <button type="button" role="tab" aria-selected={tab === 'results'} className={`cp-tab${tab === 'results' ? ' active' : ''}`} onClick={() => setTab('results')}>
          Resultados
        </button>
        <button type="button" role="tab" aria-selected={tab === 'activity'} className={`cp-tab${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>
          Actividad de contactos
        </button>
      </div>

      {tab === 'activity' ? <ContactedActivity /> : (<>
        <div className="report-range no-print" role="group" aria-label="Periodo del reporte">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" aria-pressed={preset === p.key}
              className={`report-chip${preset === p.key ? ' active' : ''}`} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="report-dates">
              <label>Desde <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
              <label>Hasta <input type="date" value={custom.to} min={custom.from || undefined} max={todayCO()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
            </span>
          )}
        </div>

        {/* Encabezado que sale en la impresión */}
        <p className="report-title">
          <strong>{user?.full_name ?? 'Empresa'}</strong> · Reporte de resultados del {validRange ? `${fmtDay(range.from)} al ${fmtDay(range.to)}` : '—'}
        </p>

        {!validRange && <p className="form-error">La fecha inicial debe ser anterior a la final.</p>}
        {error && <p className="form-error">{error instanceof Error ? error.message : 'Error al cargar el reporte'}</p>}

        {/* ── Resumen ─────────────────────────────────────────── */}
        <section className="dash-section" aria-labelledby="rep-summary">
          <h2 id="rep-summary">Resumen del periodo</h2>
          <ol className="dash-funnel report-funnel">
            {([
              ['Encontrados', t?.found, null],
              ['Contactados', t?.contacted, t ? pct(t.contacted, t.found) : null],
              ['Presentados a ti', t?.presented, t ? pct(t.presented, t.contacted) : null],
              ['Autorizados a siguiente fase', t?.authorized, t && t.authorized + t.discarded > 0 ? `${pct(t.authorized, t.authorized + t.discarded)} de lo decidido` : null],
            ] as [string, number | undefined, string | null][]).map(([label, value, rate]) => (
              <li key={label} className="dash-step">
                {rate && <span className="dash-step-rate">{rate}</span>}
                <span className="dash-step-value">{isLoading || value === undefined ? '–' : value}</span>
                <span className="dash-step-label">{label}</span>
              </li>
            ))}
          </ol>
          {t && !empty && (
            <ul className="report-facts">
              {t.discarded > 0 && (
                <li>Descartaste <strong>{t.discarded}</strong>{topReason ? <>, sobre todo por «{topReason.reason}» ({topReason.count})</> : ''}.</li>
              )}
              {t.avg_days_to_decide !== null && (
                <li>Tardaste en promedio <strong>{daysText(t.avg_days_to_decide)}</strong> en decidir sobre un candidato presentado.</li>
              )}
              {t.avg_days_to_first_presented !== null && (
                <li>Las vacantes tardan en promedio <strong>{daysText(t.avg_days_to_first_presented)}</strong> desde que se abren hasta que te presentan el primer candidato.</li>
              )}
              <li>Hoy tienes <strong>{t.pending_now}</strong> {t.pending_now === 1 ? 'candidato esperando' : 'candidatos esperando'} tu decisión.</li>
            </ul>
          )}
          {empty && <p className="dash-empty">No hubo movimiento en este periodo. Prueba con un rango más amplio.</p>}
        </section>

        {/* ── Por vacante ─────────────────────────────────────── */}
        <section className="dash-section" aria-labelledby="rep-vacancies">
          <h2 id="rep-vacancies">Por vacante</h2>
          {data && data.vacancies.length === 0 ? (
            <p className="dash-empty">No hay vacantes con movimiento en el periodo.</p>
          ) : (
            <div className="candidate-table-wrapper">
              <table className="candidate-table dash-vacancy-table">
                <thead>
                  <tr>
                    <th>Vacante</th>
                    <th className="num">Encontrados</th>
                    <th className="num">Contactados</th>
                    <th className="num">Presentados</th>
                    <th className="num">Autorizados</th>
                    <th className="num">Descartados</th>
                    <th className="num" title="Desde que se abrió la vacante hasta el primer candidato presentado">Primer presentado</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="skeleton-row">{Array.from({ length: 7 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}</tr>
                      ))
                    : data?.vacancies.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <span className="dash-vacancy-title">{v.title}</span>
                            <span className="dash-vacancy-meta">{STATUS[v.status] ?? v.status}</span>
                          </td>
                          <td className="num">{v.found}</td>
                          <td className="num">{v.contacted}</td>
                          <td className="num">{v.presented}</td>
                          <td className="num">{v.authorized}</td>
                          <td className="num">{v.discarded}</td>
                          <td className="num">{v.days_to_first_presented === null ? 'Aún no' : daysText(v.days_to_first_presented)}</td>
                        </tr>
                      ))}
                  {data && (data.unassigned.found > 0 || data.unassigned.contacted > 0) && (
                    <tr>
                      <td>
                        <span className="dash-vacancy-title">Sin vacante</span>
                        <span className="dash-vacancy-meta">Resultados de búsquedas aún sin asociar a una vacante</span>
                      </td>
                      <td className="num">{data.unassigned.found}</td>
                      <td className="num">{data.unassigned.contacted}</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Motivos de descarte ─────────────────────────────── */}
        <section className="dash-section" aria-labelledby="rep-reasons">
          <h2 id="rep-reasons">¿Por qué se descartan candidatos?</h2>
          {data && data.discard_reasons.length === 0 && data.discarded_without_reason === 0 ? (
            <p className="dash-empty">No descartaste candidatos en este periodo.</p>
          ) : data && (
            <>
              <ul className="dash-sources">
                {data.discard_reasons.map((d) => (
                  <li key={d.reason}>
                    <span className="dash-source-name">{d.reason}</span>
                    <span className="dash-source-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((d.count / data.totals.discarded) * 100)}%`, background: 'var(--red)' }} />
                    </span>
                    <span className="dash-source-text"><strong>{d.count}</strong> de {data.totals.discarded}</span>
                  </li>
                ))}
              </ul>
              {data.discarded_without_reason > 0 && (
                <p className="dash-insight">
                  {data.discarded_without_reason} {data.discarded_without_reason === 1 ? 'descarte quedó' : 'descartes quedaron'} sin motivo. Escribir el motivo le ayuda a tu equipo a buscar mejor.
                </p>
              )}
            </>
          )}
        </section>

        {/* ── Por reclutador ──────────────────────────────────── */}
        <section className="dash-section" aria-labelledby="rep-team">
          <h2 id="rep-team">Por reclutador</h2>
          {data && data.recruiters.length === 0 ? (
            <p className="dash-empty">Aún no tienes reclutadores.</p>
          ) : (
            <div className="candidate-table-wrapper">
              <table className="candidate-table dash-vacancy-table">
                <thead>
                  <tr>
                    <th>Reclutador</th>
                    <th className="num">Contactados</th>
                    <th className="num">Presentados</th>
                    <th className="num">Autorizados</th>
                    <th className="num">Descartados</th>
                    <th className="num" title="De lo que te presentó y ya decidiste, cuánto autorizaste">Acierto</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recruiters.map((m) => (
                    <tr key={m.id}>
                      <td><span className="dash-vacancy-title">{m.full_name}</span></td>
                      <td className="num">{m.contacted}</td>
                      <td className="num">{m.presented}</td>
                      <td className="num">{m.authorized}</td>
                      <td className="num">{m.discarded}</td>
                      <td className="num">{m.hit_rate === null ? '—' : `${m.hit_rate} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>)}
    </div>
  );
};
