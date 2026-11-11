'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, ExternalApplication, ExternalStatus } from '../../services/candidatePortalService';
import { MatchBadge } from './MatchBadge';

export const EXTERNAL_STATUS: Record<ExternalStatus, { label: string; tone: string }> = {
  postulado: { label: 'Postulado', tone: 'badge-pending' },
  en_proceso: { label: 'En proceso', tone: 'badge-interviewed' },
  entrevista: { label: 'Entrevista', tone: 'badge-interviewed' },
  oferta: { label: 'Oferta / siguiente fase', tone: 'badge-hired' },
  no_seleccionado: { label: 'No seleccionado', tone: 'badge-rejected' },
};

const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  for (const key of ['external-applications', 'external-jobs', 'candidate-dashboard']) qc.invalidateQueries({ queryKey: [key] });
};

/** Postulación hecha en otro sitio */
export const ExternalApplicationCard = ({ application: a, onError }: { application: ExternalApplication; onError: (m: string) => void }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(a.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = useMutation({
    mutationFn: (patch: { status?: ExternalStatus; note?: string | null }) => candidatePortalService.updateExternalApplication(a.id, patch),
    onSuccess: () => { setEditing(false); invalidate(queryClient); },
    onError: (err) => onError(err instanceof Error ? err.message : 'No se pudo actualizar'),
  });
  const remove = useMutation({
    mutationFn: () => candidatePortalService.deleteExternalApplication(a.id),
    onSuccess: () => invalidate(queryClient),
    onError: (err) => onError(err instanceof Error ? err.message : 'No se pudo eliminar'),
  });

  const status = EXTERNAL_STATUS[a.status];
  const waiting = a.status === 'postulado' ? Math.floor((Date.now() - new Date(a.applied_at).getTime()) / 86400000) : 0;

  return (
    <article className="cand-card app-card">
      <div className="cand-card-main">
        <div className="cand-card-head">
          <h2>{a.title}</h2>
          <span className={`badge ${status.tone}`}>{status.label}</span>
          <span className="ext-badge">Externa · {a.source}</span>
        </div>
        <p className="cand-meta">
          {[a.company, a.location].filter(Boolean).join(' · ')}{a.company || a.location ? ' · ' : ''}te postulaste {daysAgo(a.applied_at)}
          {a.status_changed_at && ` · último cambio ${daysAgo(a.status_changed_at)}`}
          {a.match_score !== null && <> · <MatchBadge score={a.match_score} /></>}
        </p>

        <div className="ext-status">
          <label htmlFor={`ext-status-${a.id}`}>¿Cómo va?</label>
          <select
            id={`ext-status-${a.id}`}
            value={a.status}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ status: e.target.value as ExternalStatus })}
          >
            {(Object.keys(EXTERNAL_STATUS) as ExternalStatus[]).map((k) => <option key={k} value={k}>{EXTERNAL_STATUS[k].label}</option>)}
          </select>
          <span className="app-hint">
            {waiting >= 10 ? `Llevas ${waiting} días sin respuesta: escríbeles para hacer seguimiento.` : 'Actualízalo cuando te respondan: así tu tablero refleja cómo vas.'}
          </span>
        </div>

        {editing ? (
          <div className="app-note-edit">
            <label className="sr-only" htmlFor={`ext-note-${a.id}`}>Mi nota</label>
            <textarea id={`ext-note-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} autoFocus
              placeholder="p. ej. Me escribió la reclutadora; prueba técnica el jueves" />
            <div className="cp-actions">
              <button type="button" className="btn-secondary-sm" onClick={() => { setNote(a.note ?? ''); setEditing(false); }}>Cancelar</button>
              <button type="button" className="btn-save" onClick={() => update.mutate({ note: note.trim() || null })} disabled={update.isPending}>Guardar nota</button>
            </div>
          </div>
        ) : a.note ? (
          <p className="app-note"><span>Mi nota:</span> {a.note} <button type="button" className="result-link" onClick={() => setEditing(true)}>Editar</button></p>
        ) : null}

        {confirmDelete && (
          <p className="app-note" role="alert">
            ¿Quitar esta postulación de tu registro? No cambia nada en {a.source}.{' '}
            <button type="button" className="result-link" onClick={() => remove.mutate()}>Sí, quitarla</button>{' · '}
            <button type="button" className="result-link" onClick={() => setConfirmDelete(false)}>No</button>
          </p>
        )}
      </div>
      <div className="cand-card-actions">
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn-secondary-sm ext-link">Ver oferta ↗</a>
        {!editing && !a.note && <button type="button" className="btn-secondary-sm" onClick={() => setEditing(true)}>Agregar nota</button>}
        <button type="button" className="result-link ext-remove" onClick={() => setConfirmDelete(true)}>Quitar</button>
      </div>
    </article>
  );
};

/** Registrar a mano una postulación hecha por su cuenta en otro sitio. */
export const AddExternalApplication = ({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', company: '', url: '', source: '' });
  const add = useMutation({
    mutationFn: () => candidatePortalService.addExternalApplication({
      title: form.title.trim(), company: form.company.trim() || null, url: form.url.trim(), source: form.source.trim() || null,
    }),
    onSuccess: () => { invalidate(queryClient); onDone(); },
    onError: (err) => onError(err instanceof Error ? err.message : 'No se pudo registrar'),
  });
  const urlOk = /^https?:\/\/\S+\.\S+/i.test(form.url.trim());
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form className="ext-add" onSubmit={(e) => { e.preventDefault(); if (form.title.trim() && urlOk) add.mutate(); }}>
      <p className="cp-item-sub">¿Te postulaste en otro sitio por tu cuenta? Regístrala para llevar todo en un solo lugar.</p>
      <div className="cv-grid">
        <label>Cargo*<input value={form.title} onChange={set('title')} maxLength={200} required /></label>
        <label>Empresa<input value={form.company} onChange={set('company')} maxLength={200} /></label>
        <label>Enlace de la oferta*<input type="url" value={form.url} onChange={set('url')} placeholder="https://…" required aria-invalid={!!form.url && !urlOk} /></label>
        <label>Sitio<input value={form.source} onChange={set('source')} maxLength={40} placeholder="p. ej. Computrabajo" /></label>
      </div>
      <div className="cp-actions">
        <button type="button" className="btn-secondary-sm" onClick={onDone}>Cancelar</button>
        <button type="submit" className="btn-save" disabled={add.isPending || !form.title.trim() || !urlOk}>Registrar postulación</button>
      </div>
    </form>
  );
};
