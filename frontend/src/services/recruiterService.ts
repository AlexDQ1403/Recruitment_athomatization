import { supabase } from '../lib/supabase';

export interface Recruiter {
  id: string;
  email: string;
  full_name: string;
  role: string;
  suspended?: boolean;
  last_login?: string | null;
  created_at?: string;
  /** Invitado que aún no crea su contraseña */
  invite_pending?: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autorizado');
  return { Authorization: `Bearer ${session.access_token}` };
}

export const recruiterService = {
  async list(): Promise<Recruiter[]> {
    const res = await fetch('/api/recruiters', { headers: await authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al cargar reclutadores');
    }
    const data = await res.json();
    return data.recruiters ?? [];
  },

  async resendInvite(id: string): Promise<void> {
    const res = await fetch(`/api/recruiters/${encodeURIComponent(id)}/invite`, { method: 'POST', headers: await authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'No se pudo reenviar la invitación');
    }
  },

  /** Invita al reclutador: le llega un correo para crear su propia contraseña. */
  async create(email: string, fullName: string): Promise<Recruiter> {
    const res = await fetch('/api/recruiters', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: fullName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al crear reclutador');
    }
    return res.json();
  },

  async rename(id: string, fullName: string): Promise<Recruiter> {
    const res = await fetch(`/api/recruiters/${id}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al renombrar reclutador');
    }
    return res.json();
  },

  async setSuspended(id: string, suspended: boolean): Promise<Recruiter> {
    const res = await fetch(`/api/recruiters/${id}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al actualizar reclutador');
    }
    return res.json();
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/recruiters/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al eliminar reclutador');
    }
  },
};
