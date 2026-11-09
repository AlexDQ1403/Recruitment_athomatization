'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { dashboardService } from '../../services/dashboardService';
import { getStoredUser } from '../../lib/auth';
import { CandidateStatus, STATUS_LABELS } from '../../types';
import { Icon } from '../ui/Icon';

const STATUS_COLORS: Record<CandidateStatus, string> = {
  seguimiento: 'var(--yellow)',
  en_contacto: 'var(--blue)',
  rechazado: 'var(--red)',
};
const STATUS_LABELS_PLURAL: Record<CandidateStatus, string> = {
  seguimiento: 'En Seguimiento', en_contacto: 'En Contacto', rechazado: 'Rechazados',
};
const STATUS_ICON = { seguimiento: 'clock', en_contacto: 'phone', rechazado: 'xCircle' } as const;
// Clases de insignia que sí existen en globals.css
const BADGE: Record<CandidateStatus, string> = {
  seguimiento: 'badge-pending', en_contacto: 'badge-interviewed', rechazado: 'badge-rejected',
};
const statuses: CandidateStatus[] = ['seguimiento', 'en_contacto', 'rechazado'];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export const RecruiterDashboardView = () => {
  const user = getStoredUser();

  // La clave ['candidate-stats'] ya la invalidan el Kanban, la tabla y el modal de candidatos por vacante
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['candidate-stats'],
    queryFn: () => dashboardService.recruiter(),
    refetchInterval: 30000,
  });

  const total = data?.total ?? 0;
  const pieData = statuses
    .map((s) => ({ name: STATUS_LABELS[s], value: data?.pipeline[s] ?? 0, color: STATUS_COLORS[s] }))
    .filter((d) => d.value > 0);
  const barData = statuses.map((s) => ({ name: STATUS_LABELS[s], value: data?.pipeline[s] ?? 0, fill: STATUS_COLORS[s] }));
  // Qué parte de los candidatos ya aprobó el reclutador para la empresa
  const approvalRate = total > 0 ? Math.round(((data?.approved ?? 0) / total) * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Bienvenido de nuevo, <strong style={{ color: 'var(--text-1)' }}>{user?.full_name ?? 'Usuario'}</strong></p>
      </div>

      {isError && (
        <div style={{
          background: 'color-mix(in srgb, var(--red) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 28%, transparent)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }} role="alert">
          <span style={{ fontSize: 13, color: 'var(--red)' }}>{error instanceof Error ? error.message : 'No se pudieron cargar los datos.'}</span>
          <button onClick={() => refetch()}
            style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            Reintentar
          </button>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card stat-card-total">
          <div className="stat-icon"><Icon name="users" size={16} /></div>
          <div className="stat-value" style={{ color: 'var(--text-1)' }}>{total}</div>
          <div className="stat-label">Total candidatos</div>
        </div>
        {statuses.map((s) => (
          <div key={s} className="stat-card">
            <div className="stat-icon" style={{ color: STATUS_COLORS[s] }}><Icon name={STATUS_ICON[s]} size={16} /></div>
            <div className="stat-value" style={{ color: STATUS_COLORS[s] }}>{data?.pipeline[s] ?? 0}</div>
            <div className="stat-label">{STATUS_LABELS_PLURAL[s]}</div>
            {total > 0 && <div className="stat-pct">{Math.round(((data?.pipeline[s] ?? 0) / total) * 100)}%</div>}
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--green)' }}><Icon name="check" size={16} /></div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{data?.approved ?? 0}</div>
          <div className="stat-label">Aprobados para la empresa</div>
          {total > 0 && <div className="stat-pct">{approvalRate}%</div>}
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--green)' }}><Icon name="trendingUp" size={16} /></div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{data?.hired ?? 0}</div>
          <div className="stat-label">Contratados por la empresa</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--accent-text)' }}><Icon name="clipboard" size={16} /></div>
          <div className="stat-value" style={{ color: 'var(--accent-text)' }}>{data?.vacancies.active ?? 0}</div>
          <div className="stat-label">Vacantes activas</div>
          <div className="stat-pct">{data?.vacancies.applicants_active ?? 0} aplicantes</div>
        </div>
      </div>

      {total > 0 && (
        <div className="charts-grid">
          <div className="chart-card">
            <h3 className="chart-title">Distribución por estado</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v} candidatos`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {pieData.map((d) => (
                <div key={d.name} className="legend-item">
                  <span className="legend-dot" style={{ background: d.color }} />
                  <span>{d.name}</span>
                  <span className="legend-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <h3 className="chart-title">Candidatos por etapa</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Vacantes con más aplicantes */}
      <div style={{ marginTop: 8, marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Vacantes activas</h2>
          <Link href="/vacancies" style={{ fontSize: 12.5, color: 'var(--accent-text)' }}>Gestionar vacantes</Link>
        </div>
        {!isLoading && (data?.vacancies.top.length ?? 0) === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            No tienes vacantes activas. <Link href="/vacancies" style={{ color: 'var(--accent-text)' }}>Publica una</Link> para empezar a recibir aplicantes.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data?.vacancies.top.map((v) => (
              <Link key={v.id} href="/vacancies" style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              }}>
                <span style={{ color: 'var(--text-1)', fontWeight: 500, fontSize: 13.5 }}>{v.title}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {v.applicants} {v.applicants === 1 ? 'aplicante' : 'aplicantes'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 16 }}>Actividad reciente</h2>
        <div className="candidate-table-wrapper">
          <table className="candidate-table">
            <thead>
              <tr><th>Nombre</th><th>Título</th><th>Vacante</th><th>Estado</th><th>Registrado</th></tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}
                    </tr>
                  ))
                : data?.recent.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>Aún no hay actividad.</td></tr>
                  : data?.recent.map((c) => (
                      <tr key={`${c.kind}-${c.id}`}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="avatar">{initials(c.full_name)}</span>
                            <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{c.full_name}</span>
                          </div>
                        </td>
                        <td>{c.title ?? '—'}</td>
                        <td>{c.vacancy_title ?? '—'}</td>
                        <td><span className={`badge ${BADGE[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                        <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString('es-CO')}</td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
