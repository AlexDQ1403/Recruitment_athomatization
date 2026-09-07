'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateService, CreateCandidateInput } from '../../services/candidateService';
import { Candidate, CandidateStatus, CandidateNote, StatusHistoryEntry, STATUS_LABELS } from '../../types';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';

const STATUS_COLORS: Record<CandidateStatus, string> = {
  rechazado: 'badge-rejected', 'en_contacto': 'badge-pending', seguimiento: 'badge-interviewed',
};
const fmt = (n?: number) => n !== undefined ? `$${n.toLocaleString('es-CO')}` : '—';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Tab = 'info' | 'notas' | 'historial';

interface Props {
  candidate: Candidate;
  onClose: () => void;
  onUpdate: (c: Candidate) => void;
}

export const CandidatePanel = ({ candidate: initial, onClose, onUpdate }: Props) => {
  const [tab, setTab] = useState<Tab>('info');
  const [candidate, setCandidate] = useState(initial);
  const toast = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: ({ status }: { status: CandidateStatus }) =>
      candidateService.updateStatus(candidate.id, status, candidate.status),
    onSuccess: (updated) => {
      setCandidate(updated);
      onUpdate(updated);
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-stats'] });
      toast.success('Estado actualizado');
    },
    onError: () => toast.error('Error al actualizar estado'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: 400 }}>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />

      {/* Header del candidato */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)',
          display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: '#fff',
        }}>
          {candidate.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 4 }}>{candidate.full_name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{candidate.position}</div>
          {candidate.location && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{candidate.location}</div>}
        </div>
        <select
          value={candidate.status}
          onChange={(e) => updateStatusMutation.mutate({ status: e.target.value as CandidateStatus })}
          className="status-select"
          disabled={updateStatusMutation.isPending}
          style={{ width: 'auto', fontSize: 12, flexShrink: 0 }}
        >
          {(Object.keys(STATUS_LABELS) as CandidateStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['info', 'notas', 'historial'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: '8px 8px 0 0',
            background: tab === t ? 'var(--surface-2)' : 'transparent',
            color: tab === t ? 'var(--accent)' : 'var(--text-3)',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            {t === 'info' ? 'Info' : t === 'notas' ? 'Notas' : 'Historial'}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab candidate={candidate} onResumeUploaded={(url) => setCandidate((c) => ({ ...c, resume_url: url }))} onUpdate={(updated) => { setCandidate(updated); onUpdate(updated); }} toast={toast} />}
      {tab === 'notas' && <NotasTab candidateId={candidate.id} toast={toast} />}
      {tab === 'historial' && <HistorialTab candidateId={candidate.id} />}
    </div>
  );
};

// ─── Tab Info ────────────────────────────────────────────────────────────────

function InfoTab({ candidate: c, onResumeUploaded, onUpdate, toast }: {
  candidate: Candidate;
  onResumeUploaded: (url: string) => void;
  onUpdate: (c: Candidate) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CreateCandidateInput>({
    full_name: c.full_name,
    email: c.email,
    phone: c.phone,
    position: c.position,
    experience_years: c.experience_years,
    expected_salary: c.expected_salary,
    location: c.location,
    resume_url: c.resume_url,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await candidateService.update(c.id, form);
      onUpdate(updated);
      setEditing(false);
      toast.success('Candidato actualizado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('El archivo no puede superar 10MB'); return; }
    if (!['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      toast.error('Solo se permiten archivos PDF o Word');
      return;
    }
    setUploading(true);
    try {
      const url = await candidateService.uploadResume(c.id, file);
      onResumeUploaded(url);
      toast.success('CV subido exitosamente');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir el CV');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (editing) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Nombre completo *</label>
          <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Cargo *</label>
          <input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Email</label>
          <input type="email" value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || undefined }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Teléfono</label>
          <input value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || undefined }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Experiencia (años)</label>
          <input type="number" min={0} value={form.experience_years ?? ''} onChange={(e) => setForm((f) => ({ ...f, experience_years: e.target.value ? Number(e.target.value) : undefined }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Salario esperado (COP)</label>
          <input type="number" min={0} value={form.expected_salary ?? ''} onChange={(e) => setForm((f) => ({ ...f, expected_salary: e.target.value ? Number(e.target.value) : undefined }))} />
        </div>
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label>Ubicación</label>
          <input value={form.location ?? ''} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value || undefined }))} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={handleSave} disabled={saving || !form.full_name || !form.position}
          className="btn-primary" style={{ flex: 1, marginTop: 0, padding: '9px' }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button onClick={() => setEditing(false)}
          style={{ padding: '9px 16px', borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13 }}>
          Cancelar
        </button>
      </div>
    </div>
  );

  const fields = [
    { label: 'Email',          value: c.email },
    { label: 'Teléfono',       value: c.phone },
    { label: 'Experiencia',    value: c.experience_years !== undefined ? `${c.experience_years} años` : undefined },
    { label: 'Salario esp.',   value: c.expected_salary !== undefined ? fmt(c.expected_salary) : undefined },
    { label: 'Ubicación',      value: c.location },
    { label: 'Fuente',         value: c.source === 'internal' ? 'Base interna' : c.source === 'applicant' ? 'Aplicó directamente' : 'Web scraping' },
    { label: 'Registrado',     value: fmtDate(c.created_at) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {fields.map(({ label, value }) => value ? (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{label}</span>
          <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{value}</span>
        </div>
      ) : null)}

      {(c.linkedin_url ?? c.profile_url) && (
        <a href={(c.linkedin_url ?? c.profile_url)!} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
          Ver LinkedIn
        </a>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => setEditing(true)}
          style={{ padding: '8px 16px', borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar información
        </button>

        {c.resume_url ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={c.resume_url} target="_blank" rel="noopener noreferrer"
              className="btn-primary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', display: 'block', padding: '9px', marginTop: 0 }}>
              Ver CV
            </a>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ padding: '9px 14px', borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, whiteSpace: 'nowrap' }}>
              {uploading ? 'Subiendo...' : 'Reemplazar'}
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="btn-primary" style={{ padding: '9px' }}>
            {uploading ? 'Subiendo CV...' : '+ Subir CV (PDF / Word, máx 10MB)'}
          </button>
        )}
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={handleUpload} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

// ─── Tab Notas ───────────────────────────────────────────────────────────────

function NotasTab({ candidateId, toast }: { candidateId: string; toast: ReturnType<typeof useToast> }) {
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', candidateId],
    queryFn: () => candidateService.getNotes(candidateId),
  });

  const addMutation = useMutation({
    mutationFn: (content: string) => candidateService.addNote(candidateId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', candidateId] });
      setDraft('');
      toast.success('Nota agregada');
    },
    onError: () => toast.error('Error al guardar la nota'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidateService.deleteNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', candidateId] }),
    onError: () => toast.error('Error al eliminar la nota'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe una nota sobre este candidato..."
          rows={3}
          maxLength={2000}
          style={{ resize: 'vertical', minHeight: 80 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{draft.length}/2000</span>
          <button
            onClick={() => { if (draft.trim()) addMutation.mutate(draft.trim()); }}
            disabled={!draft.trim() || addMutation.isPending}
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 20px', marginTop: 0 }}
          >
            {addMutation.isPending ? 'Guardando...' : 'Guardar nota'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando notas...</div>}
        {!isLoading && notes.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No hay notas aún. Agrega la primera.
          </div>
        )}
        {notes.map((n: CandidateNote) => (
          <div key={n.id} style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
                {n.author?.full_name ?? 'Usuario'}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtDateTime(n.created_at)}</span>
                <button
                  onClick={() => deleteMutation.mutate(n.id)}
                  disabled={deleteMutation.isPending}
                  className="btn-danger-sm"
                  title="Eliminar nota"
                  style={{ width: 22, height: 22, fontSize: 13 }}
                >×</button>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-1)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Historial ───────────────────────────────────────────────────────────

function HistorialTab({ candidateId }: { candidateId: string }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['status-history', candidateId],
    queryFn: () => candidateService.getStatusHistory(candidateId),
  });

  if (isLoading) return <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando historial...</div>;

  if (history.length === 0) return (
    <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
      Sin cambios de etapa registrados.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
      {/* Línea vertical de timeline */}
      <div style={{ position: 'absolute', left: 11, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
      {history.map((entry: StatusHistoryEntry, i) => (
        <div key={entry.id} style={{ display: 'flex', gap: 14, paddingBottom: i < history.length - 1 ? 20 : 0, position: 'relative' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0, zIndex: 1,
            background: 'var(--surface)', border: `2px solid var(--accent)`,
            display: 'grid', placeItems: 'center',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, marginBottom: 4 }}>
              {entry.from_status
                ? <><span className={`badge ${STATUS_COLORS[entry.from_status]}`} style={{ fontSize: 11 }}>{STATUS_LABELS[entry.from_status]}</span>
                  <span style={{ color: 'var(--text-3)', margin: '0 6px' }}>→</span></>
                : null}
              <span className={`badge ${STATUS_COLORS[entry.to_status]}`} style={{ fontSize: 11 }}>{STATUS_LABELS[entry.to_status]}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {entry.changer?.full_name && <span style={{ marginRight: 8 }}>por {entry.changer.full_name}</span>}
              {fmtDateTime(entry.changed_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
