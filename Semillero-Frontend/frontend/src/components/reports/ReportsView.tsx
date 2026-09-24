'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportService, DailyContactedReport } from '../../services/reportService';

const PERIODS = [
  { days: 1, label: 'Últimas 24 h' },
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
];

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export const ReportsView = () => {
  const [days, setDays] = useState(1);

  const { data, isLoading, error } = useQuery<DailyContactedReport>({
    queryKey: ['report-contacted', days],
    queryFn: () => reportService.getDailyContacted(days),
  });

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([`﻿${reportService.toCsv(data)}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contactados-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Candidatos contactados</h1>
          <p>Actividad del equipo de reclutamiento por periodo</p>
        </div>
        <button
          className="btn-primary"
          style={{ width: 'auto', padding: '10px 20px' }}
          onClick={handleExport}
          disabled={!data || data.total === 0}
        >
          Exportar CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {PERIODS.map((p) => (
          <button
            key={p.days}
            className={days === p.days ? 'btn-primary' : 'btn-secondary-sm'}
            style={days === p.days ? { width: 'auto', padding: '6px 14px', fontSize: 12.5 } : undefined}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="form-error">
          {error instanceof Error ? error.message : 'Error al cargar el reporte'}
        </div>
      )}

      {isLoading ? (
        <div className="candidate-table-wrapper">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 48, margin: 8 }} />
          ))}
        </div>
      ) : !data || data.total === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📭</p>
          <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 6 }}>
            Sin candidatos contactados en este periodo
          </p>
          <p style={{ fontSize: 13 }}>
            Aparecerán aquí cuando un reclutador mueva un candidato a &quot;En contacto&quot;.
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            <strong style={{ color: 'var(--text-1)' }}>{data.total}</strong> contacto(s) ·{' '}
            {data.recruiters.length} reclutador(es) activo(s)
          </p>

          {data.recruiters.map((group) => (
            <section key={group.recruiter_id ?? 'sin_asignar'} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span className="avatar">
                  {group.recruiter_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-1)' }}>{group.recruiter_name}</p>
                  {group.recruiter_email && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{group.recruiter_email}</p>
                  )}
                </div>
                <span className="badge badge-interviewed" style={{ marginLeft: 'auto' }}>
                  {group.candidates.length} contacto(s)
                </span>
              </div>

              <div className="candidate-table-wrapper">
                <table className="candidate-table">
                  <thead>
                    <tr>
                      <th>Candidato</th>
                      <th>Cargo</th>
                      <th>Contactado</th>
                      <th>Estado actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.candidates.map((c) => (
                      <tr key={`${c.candidate_id}-${c.contacted_at}`} className="table-row">
                        <td>{c.full_name}</td>
                        <td>{c.position ?? '—'}</td>
                        <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                          {formatDateTime(c.contacted_at)}
                        </td>
                        <td>
                          <span className={`badge ${
                            c.current_status === 'en_contacto' ? 'badge-interviewed'
                            : c.current_status === 'rechazado' ? 'badge-rejected'
                            : 'badge-pending'
                          }`}>
                            {c.current_status === 'en_contacto' ? 'En contacto'
                              : c.current_status === 'rechazado' ? 'Rechazado'
                              : 'Seguimiento'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};
