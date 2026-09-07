'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateService } from '../../services/candidateService';
import { Candidate, CandidateStatus } from '../../types';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';

const COLUMNS: { status: CandidateStatus; label: string; color: string }[] = [
  { status: 'seguimiento',  label: 'Seguimiento',  color: '#fbbf24' },
  { status: 'en_contacto',  label: 'En Contacto',  color: '#4f6ef7' },
  { status: 'rechazado',    label: 'Rechazado',    color: '#f87171' },
];

const fmt = (n?: number) => n !== undefined ? `$${Math.round(n / 1000)}k` : '';

interface Props {
  onSelect: (c: Candidate) => void;
}

export const KanbanBoard = ({ onSelect }: Props) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dragging, setDragging] = useState<Candidate | null>(null);
  const [overColumn, setOverColumn] = useState<CandidateStatus | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const { data: columns, isLoading, isError, refetch } = useQuery({
    queryKey: ['candidates-kanban'],
    queryFn: () => candidateService.listByStatus(),
    refetchInterval: 60_000,
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, status, prev }: { id: string; status: CandidateStatus; prev: CandidateStatus }) =>
      candidateService.updateStatus(id, status, prev),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
    },
    onError: () => toast.error('Error al mover candidato'),
  });

  const handleDragStart = (e: React.DragEvent, c: Candidate) => {
    setDragging(c);
    e.dataTransfer.effectAllowed = 'move';
    dragNode.current = e.currentTarget as HTMLDivElement;
    setTimeout(() => { if (dragNode.current) dragNode.current.style.opacity = '0.4'; }, 0);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setOverColumn(null);
    if (dragNode.current) dragNode.current.style.opacity = '1';
    dragNode.current = null;
  };

  const handleDrop = (e: React.DragEvent, targetStatus: CandidateStatus) => {
    e.preventDefault();
    if (dragging && dragging.status !== targetStatus) {
      moveMutation.mutate({ id: dragging.id, status: targetStatus, prev: dragging.status });
    }
    setOverColumn(null);
  };

  if (isError) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--red)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }} role="alert">
      <span>No se pudo cargar el tablero. Verifica tu conexión.</span>
      <button onClick={() => refetch()} style={{ fontSize: 13, color: 'var(--accent)', padding: '6px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        Reintentar
      </button>
    </div>
  );

  if (isLoading) return (
    <div className="kanban-board-scroll">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, minWidth: 800 }}>
      {COLUMNS.map((col) => (
        <div key={col.status} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 16, minHeight: 400,
        }}>
          <div className="skeleton" style={{ height: 20, marginBottom: 12, width: '60%' }} />
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 90, marginBottom: 10, borderRadius: 10 }} />)}
        </div>
      ))}
    </div>
    </div>
  );

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      <div className="kanban-board-scroll">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start', minWidth: 800 }}>
        {COLUMNS.map((col) => {
          const cards = columns?.[col.status] ?? [];
          const isOver = overColumn === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => { e.preventDefault(); setOverColumn(col.status); }}
              onDragLeave={() => setOverColumn(null)}
              onDrop={(e) => handleDrop(e, col.status)}
              style={{
                background: 'var(--surface)',
                border: `1px solid ${isOver ? col.color : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                transition: 'border-color 150ms',
                boxShadow: isOver ? `0 0 0 1px ${col.color}22` : 'none',
              }}
            >
              {/* Cabecera columna */}
              <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{col.label}</span>
                <span style={{
                  marginLeft: 'auto', background: 'var(--surface-2)', color: 'var(--text-3)',
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                }}>{cards.length}</span>
              </div>

              {/* Tarjetas */}
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}>
                {cards.length === 0 && (
                  <div style={{
                    border: `2px dashed ${isOver ? col.color : 'var(--border)'}`,
                    borderRadius: 10, padding: '24px 16px', textAlign: 'center',
                    color: 'var(--text-3)', fontSize: 12, transition: 'border-color 150ms',
                  }}>
                    {isOver ? 'Soltar aquí' : 'Sin candidatos'}
                  </div>
                )}
                {cards.map((c) => (
                  <KanbanCard
                    key={c.id}
                    candidate={c}
                    onSelect={onSelect}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={dragging?.id === c.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </>
  );
};

function KanbanCard({ candidate: c, onSelect, onDragStart, onDragEnd, isDragging }: {
  candidate: Candidate;
  onSelect: (c: Candidate) => void;
  onDragStart: (e: React.DragEvent, c: Candidate) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, c)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(c)}
      style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 14px', cursor: 'grab',
        transition: 'box-shadow 150ms, transform 150ms, opacity 150ms',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isDragging ? 'none' : '0 1px 4px rgba(0,0,0,.2)',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.35)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,.2)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)',
          display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: '#fff',
        }}>
          {c.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.full_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.position}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {c.location && (
          <span style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {c.location}
          </span>
        )}
        {c.experience_years !== undefined && (
          <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{c.experience_years}a exp.</span>
        )}
        {c.expected_salary !== undefined && (
          <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{fmt(c.expected_salary)}</span>
        )}
        <span style={{
          fontSize: 10, marginLeft: 'auto', padding: '2px 6px', borderRadius: 999,
          background: c.source === 'internal' ? 'rgba(52,211,153,.1)' : c.source === 'applicant' ? 'rgba(155,127,212,.1)' : 'rgba(251,191,36,.1)',
          color: c.source === 'internal' ? 'var(--green)' : c.source === 'applicant' ? 'var(--purple)' : 'var(--yellow)',
        }}>
          {c.source === 'internal' ? 'BD' : c.source === 'applicant' ? 'Aplicante' : 'Web'}
        </span>
      </div>
    </div>
  );
}
