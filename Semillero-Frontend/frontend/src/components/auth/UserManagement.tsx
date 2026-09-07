'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../../services/authService';
import { User, UserRole } from '../../types';
import { ToastContainer } from '../ui/Toast';
import { useToast } from '../../hooks/useToast';
import { ConfirmModal } from '../ui/ConfirmModal';

const ROLE_LABELS: Record<UserRole, string> = {
  superAdmin: 'Super Admin',
  empresa: 'Empresa',
  recruiter: 'Reclutador',
};

export const UserManagement = () => {
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => authService.listUsers(),
  });

  const createMutation = useMutation({
    mutationFn: ({ email, password, full_name, role }: { email: string; password: string; full_name: string; role: UserRole }) =>
      authService.createUser(email, password, full_name, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      toast.success('Usuario creado exitosamente');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al crear usuario'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authService.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuario eliminado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al eliminar usuario'),
  });

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar al usuario "${deleteTarget.full_name}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Gestión de usuarios</h1>
            <p>Administra los accesos al sistema</p>
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setShowForm(true)}>
            + Nuevo usuario
          </button>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Crear usuario</h3>
                <button onClick={() => setShowForm(false)} className="modal-close">×</button>
              </div>
              <CreateUserForm
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
                <th>Rol</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 4 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}
                    </tr>
                  ))
                : users.map((u: User) => (
                    <tr key={u.id} className="table-row">
                      <td className="name-cell">
                        <span className="avatar">{u.full_name.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()}</span>
                        {u.full_name}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`badge ${u.role === 'superAdmin' ? 'badge-hired' : 'badge-interviewed'}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-danger-sm"
                          onClick={() => setDeleteTarget(u)}
                          title="Eliminar usuario"
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

interface FormData { email: string; password: string; full_name: string; role: UserRole; }

const CreateUserForm = ({ onSubmit, loading, error }: { onSubmit: (d: FormData) => void; loading: boolean; error: string | null }) => {
  const [form, setForm] = useState<FormData>({ email: '', password: '', full_name: '', role: 'recruiter' });
  const [localError, setLocalError] = useState<string | null>(null);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
      <div className="form-group">
        <label>Rol</label>
        <select value={form.role} onChange={set('role')}>
          <option value="recruiter">Reclutador</option>
          <option value="superAdmin">Super Admin</option>
        </select>
      </div>
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Creando...' : 'Crear usuario'}
      </button>
    </form>
  );
};
