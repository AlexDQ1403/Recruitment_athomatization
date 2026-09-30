'use client';
import { useQuery } from '@tanstack/react-query';
import { companyCandidateService } from '../../services/companyCandidateService';
import { getStoredUser } from '../../lib/auth';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_BADGE: Record<string, string> = {
  seguimiento: 'badge-interviewed',
  en_contacto: 'badge-pending',
  rechazado: 'badge-rejected',
};

/**
 * Dashboard de Empresa: bandeja de candidatos preseleccionados por los
 * reclutadores. Nunca muestra candidatos encontrados/postulados sin aprobar
 * — la fuente es GET /api/company/candidates (solo presented_to_company=true).
 */
export const EmpresaDashboardView = () => {
  const user = getStoredUser();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['company-candidates', 'dashboard'],
    queryFn: () => companyCandidateService.list(8, 0),
    refetchInterval: 30000,
  });

  const processes = data?.candidates ?? [];
  const total = data?.total ?? 0;
  const byStatus = processes.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Bienvenido de nuevo, <strong style={{ color: 'var(--text-1)' }}>{user?.full_name ?? 'Usuario'}</strong></p>
      </div>

      {isError && (
        <div style={{
          background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }} role="alert">
          <span style={{ fontSize: 13, color: 'var(--red)' }}>No se pudieron cargar los datos. Verifica tu conexión.</span>
          <button
            onClick={() => refetch()}
            style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >Reintentar</button>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card stat-card-total">
          <div className="stat-icon">✅</div>
          <div className="stat-value" style={{ color: 'var(--text-1)' }}>{total}</div>
          <div className="stat-label">Candidatos presentados</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-value" style={{ color: '#fbbf24' }}>{byStatus.seguimiento ?? 0}</div>
          <div className="stat-label">En seguimiento</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎙️</div>
          <div className="stat-value" style={{ color: '#4f6ef7' }}>{byStatus.en_contacto ?? 0}</div>
          <div className="stat-label">En contacto</div>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 16 }}>
          Últimos candidatos presentados
        </h2>
        <div className="candidate-table-wrapper">
          <table className="candidate-table">
            <thead>
              <tr>
                <th>Candidato</th>
                <th>Cargo</th>
                <th>Reclutador</th>
                <th>Estado</th>
                <th>Presentado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}
                    </tr>
                  ))
                : processes.length === 0
                ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 13 }}>
                        Aún no hay candidatos presentados por tus reclutadores.
                      </td>
                    </tr>
                  )
                : processes.map((p) => (
                    <tr key={p.candidate.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="avatar">{p.candidate.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
                          <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{p.candidate.full_name}</span>
                        </div>
                      </td>
                      <td>{p.candidate.position ?? '—'}</td>
                      <td>{p.recruiter?.full_name ?? '—'}</td>
                      <td><span className={`badge ${STATUS_BADGE[p.status] ?? ''}`}>{p.status}</span></td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.presented_at ? fmtDate(p.presented_at) : '—'}</td>
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
