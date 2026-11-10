import { supabase } from '../lib/supabase';
import { CandidateKind, CandidateProfileDetail, CandidateRejection, ContactChannel } from '../types';

const authHeader = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autorizado');
  return `Bearer ${session.access_token}`;
};

/** 'auto': mensajes del chat guardados antes de que las tarjetas trajeran su origen. */
type KindParam = CandidateKind | 'auto';

export const candidateProfileService = {
  async get(kind: KindParam, id: string): Promise<CandidateProfileDetail> {
    const res = await fetch(`/api/candidate-profiles/${kind}/${id}`, {
      headers: { Authorization: await authHeader() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'No se pudo cargar el perfil');
    }
    return res.json();
  },

  /** Rechaza SOLO para ese puesto (cargo y/o vacante). Repetir el mismo puesto no duplica. */
  async reject(
    kind: KindParam,
    id: string,
    input: { role?: string; vacancy_id?: string; reason?: string }
  ): Promise<CandidateRejection> {
    const res = await fetch(`/api/candidate-profiles/${kind}/${id}/rejections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo registrar el rechazo');
    return body as CandidateRejection;
  },

  async undoReject(kind: KindParam, id: string, rejectionId: string): Promise<void> {
    const res = await fetch(`/api/candidate-profiles/${kind}/${id}/rejections/${rejectionId}`, {
      method: 'DELETE',
      headers: { Authorization: await authHeader() },
    });
    if (!res.ok) throw new Error('No se pudo deshacer el rechazo');
  },

  async logContact(kind: CandidateKind, id: string, channel: ContactChannel): Promise<{ channel: ContactChannel; created_at: string }> {
    const res = await fetch(`/api/candidate-profiles/${kind}/${id}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ channel }),
    });
    if (!res.ok) throw new Error('No se pudo registrar el contacto');
    return res.json();
  },
};
