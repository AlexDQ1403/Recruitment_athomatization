'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { companyCandidateService } from '../../services/companyCandidateService';
import { CompanyCandidateProcess, STATUS_LABELS, CandidateStatus } from '../../types';
import { CompanyDecisionControl } from './CompanyDecisionControl';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUS_BADGE: Record<string, string> = {
  seguimiento: 'badge-interviewed',
  en_contacto: 'badge-pending',
  rechazado: 'badge-rejected',
};

/**
 * "Candidatos aceptados" para Empresa: lista de lo que un reclutador APROBÓ.
 * Cada fila es un candidato → reclutador → aprobación → estado. Un candidato
 * rechazado o devuelto a seguimiento sale de esta lista (ver PATCH /api/candidates/:id/decision
 * y GET /api/company/candidates).
 */
export const CompanyCandidatesHistoryView = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['company-candidates', 'history'],
    queryFn: () => companyCandidateService.list(200, 0),
  });

  const processes = data?.candidates ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Candidatos aceptados</h1>
        <p>Candidatos que tus reclutadores aprobaron para tu empresa. Tú decides si contratarlos o descartarlos.</p>
      </div>

      {data && (
        <div style={{ display: 'flex', gap: 18, marginBottom: 18, fontSize: 13, color: 'var(--text-2)', flexWrap: 'wrap' }}>
          <span><strong style={{ color: 'var(--yellow)' }}>{data.summary.pendiente}</strong> por decidir</span>
          <span><strong style={{ color: 'var(--green)' }}>{data.summary.contratado}</strong> contratados</span>
          <span><strong style={{ color: 'var(--red)' }}>{data.summary.descartado}</strong> descartados</span>
        </div>
      )}

      {isError && (
        <div style={{
          background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }} role="alert">
          <span style={{ fontSize: 13, color: 'var(--red)' }}>No se pudo cargar la lista de candidatos aceptados.</span>
          <button
            onClick={() => refetch()}
            style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >Reintentar</button>
        </div>
      )}

      <div className="candidate-table-wrapper">
        <table className="candidate-table">
          <thead>
            <tr>
              <th>Candidato</th>
              <th>Cargo</th>
              <th>Reclutador responsable</th>
              <th>Proceso / Oferta</th>
              <th>Presentado</th>
              <th>Proceso</th>
              <th>Tu decisión</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="skeleton-row">
                    {Array.from({ length: 7 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}
                  </tr>
                ))
              : processes.length === 0
              ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 13 }}>
                      Todavía no hay candidatos aceptados. Aparecerán aquí cuando un reclutador los apruebe.
                    </td>
                  </tr>
                )
              : processes.map((p) => (
                  <ProcessRow
                    key={`${p.kind}-${p.candidate.id}`}
                    process={p}
                    expanded={expanded === p.candidate.id}
                    onToggle={() => setExpanded((cur) => (cur === p.candidate.id ? null : p.candidate.id))}
                  />
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
};

function ProcessRow({ process: p, expanded, onToggle }: {
  process: CompanyCandidateProcess;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="avatar">{p.candidate.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{p.candidate.full_name}</span>
          </div>
        </td>
        <td>{p.candidate.position ?? '—'}</td>
        <td>{p.recruiter?.full_name ?? 'Sin asignar'}</td>
        <td>{p.vacancy?.title ?? '—'}</td>
        <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.presented_at ? fmtDate(p.presented_at) : '—'}</td>
        <td><span className={`badge ${STATUS_BADGE[p.status] ?? ''}`}>{STATUS_LABELS[p.status as CandidateStatus] ?? p.status}</span></td>
        <td><CompanyDecisionControl candidate={{ kind: p.kind, id: p.candidate.id, full_name: p.candidate.full_name }} decision={p.decision} /></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: 'var(--surface-2)', padding: '14px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {p.candidate.location && <span>Ubicación: {p.candidate.location}</span>}
              {p.candidate.experience_years !== null && <span>Experiencia: {p.candidate.experience_years} años</span>}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, marginBottom: 8 }}>
              Historial de cambios de estado
            </div>
            {p.status_history.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sin cambios de estado registrados aún.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {p.status_history.map((h, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: 'var(--text-1)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {h.from_status && <span className={`badge ${STATUS_BADGE[h.from_status] ?? ''}`} style={{ fontSize: 11 }}>{h.from_status}</span>}
                    {h.from_status && <span style={{ color: 'var(--text-3)' }}>→</span>}
                    <span className={`badge ${STATUS_BADGE[h.to_status] ?? ''}`} style={{ fontSize: 11 }}>{h.to_status}</span>
                    <span style={{ color: 'var(--text-3)' }}>
                      {h.changed_by_name && `por ${h.changed_by_name} · `}{fmtDateTime(h.changed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
