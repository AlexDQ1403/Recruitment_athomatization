'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountService } from '../../services/accountService';
import { setStoredUser, getStoredUser } from '../../lib/auth';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';

const ROLE_LABEL: Record<string, string> = {
  empresa: 'Empresa',
  recruiter: 'Reclutador',
  superAdmin: 'Super Admin',
};

/**
 * Perfil propio de Empresa/Reclutador. Lo editable depende del rol
 * (ver backend/src/routes/account.ts): Empresa administra nombre, correo y
 * foto; Reclutador solo su foto. Nunca el rol — no hay campo para eso.
 */
export const AccountProfileView = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<{ full_name: string; email: string } | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => accountService.getProfile(),
  });

  useEffect(() => {
    if (profile && !form) setForm({ full_name: profile.full_name ?? '', email: profile.email });
  }, [profile, form]);

  const isEmpresa = profile?.role === 'empresa';

  const saveMutation = useMutation({
    mutationFn: (input: { full_name?: string; email?: string }) => accountService.updateProfile(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(['account-profile'], updated);
      const stored = getStoredUser();
      if (stored) setStoredUser({ ...stored, full_name: updated.full_name ?? stored.full_name });
      toast.success('Perfil actualizado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await accountService.uploadAvatar(file);
      queryClient.setQueryData(['account-profile'], (prev: typeof profile) => prev ? { ...prev, avatar_url: url } : prev);
      toast.success('Foto actualizada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir la foto');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (isLoading || !profile || !form) {
    return <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando perfil...</div>;
  }

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      <div className="page-header">
        <h1>Mi perfil</h1>
        <p>{ROLE_LABEL[profile.role] ?? profile.role}</p>
      </div>

      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)',
            display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, color: '#fff',
          }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (profile.full_name ?? profile.email).split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
            }
          </div>
          <div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ padding: '8px 16px', borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13 }}>
              {uploading ? 'Subiendo...' : 'Cambiar foto'}
            </button>
            <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handleUpload} style={{ display: 'none' }} />
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>PNG, JPG o WEBP, máx 3MB</p>
          </div>
        </div>

        {isEmpresa ? (
          <>
            <div className="form-group">
              <label>Nombre</label>
              <input value={form.full_name} onChange={(e) => setForm((f) => f && { ...f, full_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Correo electrónico</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => f && { ...f, email: e.target.value })} />
            </div>
            <button
              className="btn-primary"
              disabled={saveMutation.isPending || !form.full_name.trim() || !form.email.trim()}
              onClick={() => {
                const updates: { full_name?: string; email?: string } = {};
                if (form.full_name.trim() !== (profile.full_name ?? '')) updates.full_name = form.full_name.trim();
                if (form.email.trim() !== profile.email) updates.email = form.email.trim();
                if (Object.keys(updates).length === 0) { toast.info('No hay cambios que guardar'); return; }
                saveMutation.mutate(updates);
              }}
            >
              {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Tu nombre y correo los administra tu empresa desde Gestión de Reclutadores.
          </p>
        )}
      </div>
    </div>
  );
};
