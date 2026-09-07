'use client';
import { Fragment, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateService, CandidateFilters } from '../../services/candidateService';
import { Candidate, CandidateStatus, STATUS_LABELS } from '../../types';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';

const STATUS_COLORS: Record<CandidateStatus, string> = {
  rechazado: 'badge-rejected', 'en_contacto': 'badge-pending', seguimiento: 'badge-interviewed',
};
const fmt = (n?: number) => n !== undefined ? `$${n.toLocaleString('es-CO')}` : '—';

function exportCSV(items: Candidate[]) {
  const headers = ['Nombre', 'Email', 'Teléfono', 'Cargo', 'Experiencia (años)', 'Salario esperado', 'Ubicación', 'Estado', 'Fuente', 'LinkedIn', 'Registrado'];
  const rows = items.map((c) => [
    c.full_name, c.email ?? '', c.phone ?? '', c.position,
    c.experience_years ?? '', c.expected_salary ?? '',
    c.location ?? '', STATUS_LABELS[c.status],
    c.source === 'internal' ? 'Interno' : c.source === 'applicant' ? 'Aplicante' : 'Web',
    c.linkedin_url ?? c.profile_url ?? '',
    new Date(c.created_at).toLocaleDateString('es-CO'),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `candidatos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

interface Props { onSelect?: (c: Candidate) => void; }

export const CandidateTable = ({ onSelect }: Props) => {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<CandidateFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['candidates', page, filters],
    queryFn: () => candidateService.list(page, 15, filters),
    placeholderData: (prev) => prev,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CandidateStatus }) =>
      candidateService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
      toast.success('Estado actualizado');
    },
    onError: () => toast.error('Error al actualizar estado'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidateService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
      toast.success('Candidato eliminado');
    },
    onError: () => toast.error('Error al eliminar candidato'),
  });

  const applySearch = useCallback(() => {
    setFilters((f) => ({ ...f, search: searchInput || undefined }));
    setPage(1);
  }, [searchInput]);

  const clearFilters = () => { setFilters({}); setSearchInput(''); setPage(1); };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  if (isError) return (
    <div className="table-error" role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span>No se pudieron cargar los candidatos. Verifica tu conexión.</span>
      <button onClick={() => refetch()} style={{ fontSize: 13, color: 'var(--accent)', padding: '6px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        Reintentar
      </button>
    </div>
  );

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar a "${deleteTarget.full_name}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="candidate-table-wrapper">
        <div className="table-toolbar">
          <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
            Candidatos <span style={{ color: 'var(--text-3)', fontSize: 13, fontWeight: 400 }}>({data?.total ?? 0})</span>
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                placeholder="Buscar nombre, cargo, email..."
                style={{ width: 260, paddingRight: 36, fontSize: 13 }}
              />
              <button onClick={applySearch} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 15 }}>⌕</button>
            </div>

            {/* Estado */}
            <select
              value={filters.status ?? ''}
              onChange={(e) => { setFilters((f) => ({ ...f, status: (e.target.value as CandidateStatus) || undefined })); setPage(1); }}
              style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}
            >
              <option value="">Todos los estados</option>
              {(Object.keys(STATUS_LABELS) as CandidateStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>

            {/* Filtros avanzados toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: showFilters ? 'var(--accent-glow)' : 'var(--surface-2)',
                border: `1px solid ${showFilters ? 'var(--accent)' : 'var(--border)'}`,
                color: showFilters ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              ⚙ Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>

            {activeFilterCount > 0 && (
              <button onClick={clearFilters} style={{ color: 'var(--text-3)', fontSize: 12 }}>× Limpiar</button>
            )}

            {/* Exportar CSV */}
            <button
              onClick={() => data?.items && exportCSV(data.items)}
              disabled={!data?.items?.length}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              ↓ CSV
            </button>
          </div>
        </div>

        {/* Filtros avanzados */}
        {showFilters && (
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
              <label style={{ fontSize: 11 }}>Ubicación</label>
              <input
                placeholder="Bogotá..."
                value={filters.location ?? ''}
                onChange={(e) => { setFilters((f) => ({ ...f, location: e.target.value || undefined })); setPage(1); }}
                style={{ fontSize: 12, padding: '6px 10px' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 110 }}>
              <label style={{ fontSize: 11 }}>Exp. mín (años)</label>
              <input
                type="number" min={0} placeholder="0"
                value={filters.min_experience ?? ''}
                onChange={(e) => { setFilters((f) => ({ ...f, min_experience: e.target.value ? Number(e.target.value) : undefined })); setPage(1); }}
                style={{ fontSize: 12, padding: '6px 10px' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 110 }}>
              <label style={{ fontSize: 11 }}>Exp. máx (años)</label>
              <input
                type="number" min={0} placeholder="10"
                value={filters.max_experience ?? ''}
                onChange={(e) => { setFilters((f) => ({ ...f, max_experience: e.target.value ? Number(e.target.value) : undefined })); setPage(1); }}
                style={{ fontSize: 12, padding: '6px 10px' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 130 }}>
              <label style={{ fontSize: 11 }}>Salario mín (COP)</label>
              <input
                type="number" min={0} placeholder="2000000"
                value={filters.min_salary ?? ''}
                onChange={(e) => { setFilters((f) => ({ ...f, min_salary: e.target.value ? Number(e.target.value) : undefined })); setPage(1); }}
                style={{ fontSize: 12, padding: '6px 10px' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 130 }}>
              <label style={{ fontSize: 11 }}>Salario máx (COP)</label>
              <input
                type="number" min={0} placeholder="10000000"
                value={filters.max_salary ?? ''}
                onChange={(e) => { setFilters((f) => ({ ...f, max_salary: e.target.value ? Number(e.target.value) : undefined })); setPage(1); }}
                style={{ fontSize: 12, padding: '6px 10px' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 110 }}>
              <label style={{ fontSize: 11 }}>Fuente</label>
              <select
                value={filters.source ?? ''}
                onChange={(e) => { setFilters((f) => ({ ...f, source: (e.target.value as 'internal' | 'scraping' | 'applicant') || undefined })); setPage(1); }}
                style={{ fontSize: 12, padding: '6px 10px' }}
              >
                <option value="">Todas</option>
                <option value="internal">Interno</option>
                <option value="scraping">Web scraping</option>
                <option value="applicant">Aplicante</option>
              </select>
            </div>
          </div>
        )}

        <div className="table-scroll">
          <table className="candidate-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cargo</th>
                <th>Exp.</th>
                <th>Salario esp.</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Fuente</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 8 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}
                    </tr>
                  ))
                : data?.items.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
                        No hay candidatos con los filtros aplicados
                      </td>
                    </tr>
                  )
                  : data?.items.map((c) => (
                    <tr key={c.id} onClick={() => onSelect?.(c)} className="table-row">
                      <td className="name-cell">
                        <span className="avatar">{c.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
                        <div>
                          <div>{c.full_name}</div>
                          {c.email && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.email}</div>}
                        </div>
                      </td>
                      <td>{c.position}</td>
                      <td>{c.experience_years !== undefined ? `${c.experience_years} años` : '—'}</td>
                      <td>{fmt(c.expected_salary)}</td>
                      <td>{c.location ?? '—'}</td>
                      <td><span className={`badge ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                      <td>
                        <span className={`badge ${c.source === 'internal' ? 'badge-hired' : c.source === 'applicant' ? 'badge-applicant' : 'badge-pending'}`}>
                          {c.source === 'internal' ? 'Interno' : c.source === 'applicant' ? 'Aplicante' : 'Web'}
                        </span>
                      </td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={c.status}
                          onChange={(e) => updateStatus.mutate({ id: c.id, status: e.target.value as CandidateStatus })}
                          className="status-select"
                        >
                          {(Object.keys(STATUS_LABELS) as CandidateStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                        {(c.linkedin_url ?? c.profile_url) && (
                          <a href={(c.linkedin_url ?? c.profile_url)!} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 14, color: 'var(--accent)', padding: '4px' }}
                            title="Ver LinkedIn">in</a>
                        )}
                        <button
                          className="btn-danger-sm"
                          onClick={() => setDeleteTarget(c)}
                          title="Eliminar"
                        >×</button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">
              Mostrando {((page - 1) * 15) + 1}–{Math.min(page * 15, data.total)} de {data.total} candidatos
            </span>
            <div className="pagination-controls">
              <button onClick={() => setPage(1)} disabled={page === 1} title="Primera">«</button>
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === data.totalPages || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 4px', color: 'var(--text-3)' }}>…</span>}
                    <button onClick={() => setPage(p)} className={p === page ? 'active' : ''}>{p}</button>
                  </Fragment>
                ))
              }
              <button onClick={() => setPage((p) => p + 1)} disabled={page === data.totalPages}>›</button>
              <button onClick={() => setPage(data.totalPages)} disabled={page === data.totalPages} title="Última">»</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
