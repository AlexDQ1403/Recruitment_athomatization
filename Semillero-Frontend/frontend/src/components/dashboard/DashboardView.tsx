'use client';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { candidateService } from '../../services/candidateService';
import { getStoredUser } from '../../lib/auth';
import { CandidateStatus, STATUS_LABELS } from '../../types';

const STATUS_COLORS: Record<CandidateStatus, string> = {
  seguimiento:  '#fbbf24',
  'en_contacto': '#4f6ef7',
  rechazado:    '#f87171',
};
const STATUS_LABELS_PLURAL: Record<CandidateStatus, string> = {
  seguimiento: 'En Seguimiento', 'en_contacto': 'En Contacto', rechazado: 'Rechazados',
};
const statuses: CandidateStatus[] = ['seguimiento', 'en_contacto', 'rechazado'];

export const DashboardView = () => {
  const user = getStoredUser();

  const { data: stats, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['candidate-stats'],
    queryFn: () => candidateService.getStatsByStatus(),
    refetchInterval: 30000,
  });

  const { data: recent, isLoading, isError: recentError, refetch: refetchRecent } = useQuery({
    queryKey: ['candidates-recent'],
    queryFn: () => candidateService.list(1, 8),
    refetchInterval: 30000,
  });

  const total = stats ? Object.values(stats).reduce((a, b) => a + b, 0) : 0;

  const pieData = statuses
    .map((s) => ({ name: STATUS_LABELS[s], value: stats?.[s] ?? 0, color: STATUS_COLORS[s] }))
    .filter((d) => d.value > 0);

  const barData = statuses.map((s) => ({
    name: STATUS_LABELS[s].slice(0, 8),
    value: stats?.[s] ?? 0,
    fill: STATUS_COLORS[s],
  }));

  const conversionRate = total > 0 ? Math.round(((stats?.hired ?? 0) / total) * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Bienvenido de nuevo, <strong style={{ color: 'var(--text-1)' }}>{user?.full_name ?? 'Usuario'}</strong></p>
      </div>

      {(statsError || recentError) && (
        <div style={{
          background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }} role="alert">
          <span style={{ fontSize: 13, color: 'var(--red)' }}>No se pudieron cargar los datos. Verifica tu conexión.</span>
          <button
            onClick={() => { refetchStats(); refetchRecent(); }}
            style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >Reintentar</button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card stat-card-total">
          <div className="stat-icon">👥</div>
          <div className="stat-value" style={{ color: 'var(--text-1)' }}>{total}</div>
          <div className="stat-label">Total candidatos</div>
        </div>
        {statuses.map((s) => (
          <div key={s} className="stat-card">
            <div className="stat-icon">{s === 'seguimiento' ? '⏳' : s === 'en_contacto' ? '🎙️' : '❌'}</div>
            <div className="stat-value" style={{ color: STATUS_COLORS[s] }}>{stats?.[s] ?? 0}</div>
            <div className="stat-label">{STATUS_LABELS_PLURAL[s]}</div>
            {total > 0 && (
              <div className="stat-pct">{Math.round(((stats?.[s] ?? 0) / total) * 100)}%</div>
            )}
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{conversionRate}%</div>
          <div className="stat-label">Tasa de contratación</div>
        </div>
      </div>

      {/* Charts */}
      {total > 0 && (
        <div className="charts-grid">
          <div className="chart-card">
            <h3 className="chart-title">Distribución por estado</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v} candidatos`, '']}
                />
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
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent */}
      <div style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 16 }}>
          Actividad reciente
        </h2>
        <div className="candidate-table-wrapper">
          <table className="candidate-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cargo</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Registrado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}
                    </tr>
                  ))
                : recent?.items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="avatar">{c.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
                          <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{c.full_name}</span>
                        </div>
                      </td>
                      <td>{c.position}</td>
                      <td>{c.location ?? '—'}</td>
                      <td><span className={`badge badge-${c.status}`}>{STATUS_LABELS[c.status]}</span></td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString('es-CO')}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
