'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recruiterService, Recruiter } from '../../services/recruiterService';
import { ToastContainer } from '../ui/Toast';
import { useToast } from '../../hooks/useToast';
import { ConfirmModal } from '../ui/ConfirmModal';

export const RecruiterManagement = () => {
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Recruiter | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: recruiters = [], isLoading } = useQuery({
    queryKey: ['recruiters'],
    queryFn: () => recruiterService.list(),
  });

  const createMutation = useMutation({
    mutationFn: ({ email, password, full_name }: FormData) =>
      recruiterService.create(email, password, full_name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiters'] });
      setShowForm(false);
      toast.success('Reclutador creado exitosamente');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al crear reclutador'),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      recruiterService.setSuspended(id, suspended),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['recruiters'] });
      toast.success(vars.suspended ? 'Reclutador suspendido' : 'Reclutador reactivado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al actualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recruiterService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruiters'] });
      toast.success('Reclutador eliminado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al eliminar'),
  });

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar al reclutador "${deleteTarget.full_name}"? Perderá el acceso al sistema.`}
          confirmLabel="Eliminar"
          onConfirm={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Gestión de reclutadores</h1>
            <p>Administra el equipo de reclutamiento de tu empresa</p>
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setShowForm(true)}>
            + Nuevo reclutador
          </button>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Crear reclutador</h3>
                <button onClick={() => setShowForm(false)} className="modal-close">×</button>
              </div>
              <CreateRecruiterForm
                onSubmit={(data) => createMutation.mutate(data)}
                loading={createMutation.isPending}
                error={createMutation.error?.message ?? null}
              />
            </div>
          </div>
        )}

        <div className="candidate-table-wrapper">
          <table className="candidate-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Último acceso</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}
                    </tr>
                  ))
                : recruiters.length === 0
                ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                        Aún no hay reclutadores. Crea el primero para empezar.
                      </td>
                    </tr>
                  )
                : recruiters.map((r) => (
                    <tr key={r.id} className="table-row">
                      <td className="name-cell">
                        <span className="avatar">
                          {r.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                        {r.full_name}
                      </td>
                      <td>{r.email}</td>
                      <td>{r.last_login ? new Date(r.last_login).toLocaleDateString('es-CO') : 'Nunca'}</td>
                      <td>
                        <span className={`badge ${r.suspended ? 'badge-rejected' : 'badge-hired'}`}>
                          {r.suspended ? 'Suspendido' : 'Activo'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          className="btn-secondary-sm"
                          onClick={() => suspendMutation.mutate({ id: r.id, suspended: !r.suspended })}
                          disabled={suspendMutation.isPending}
                        >
                          {r.suspended ? 'Reactivar' : 'Suspender'}
                        </button>
                        <button
                          className="btn-danger-sm"
                          onClick={() => setDeleteTarget(r)}
                          title="Eliminar reclutador"
                        >×</button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

interface FormData { email: string; password: string; full_name: string; }

const CreateRecruiterForm = ({ onSubmit, loading, error }: { onSubmit: (d: FormData) => void; loading: boolean; error: string | null }) => {
  const [form, setForm] = useState<FormData>({ email: '', password: '', full_name: '' });
  const [localError, setLocalError] = useState<string | null>(null);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { setLocalError('La contraseña debe tener al menos 8 caracteres'); return; }
    if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setLocalError('La contraseña debe ser alfanumérica (letras y números)');
      return;
    }
    setLocalError(null);
    onSubmit(form);
  };

  const displayError = localError ?? error;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {displayError && <div className="form-error">{displayError}</div>}
      <div className="form-group">
        <label>Nombre completo</label>
        <input value={form.full_name} onChange={set('full_name')} placeholder="Juan Pérez" required minLength={2} />
      </div>
      <div className="form-group">
        <label>Correo electrónico</label>
        <input type="email" value={form.email} onChange={set('email')} placeholder="juan@empresa.com" required />
      </div>
      <div className="form-group">
        <label>Contraseña</label>
        <input type="password" value={form.password} onChange={set('password')} placeholder="Mínimo 8 caracteres alfanuméricos" required />
      </div>
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Creando...' : 'Crear reclutador'}
      </button>
    </form>
  );
};
