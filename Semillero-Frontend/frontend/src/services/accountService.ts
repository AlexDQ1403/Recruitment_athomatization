import { supabase } from '../lib/supabase';

export interface AccountProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string;
}

export interface UpdateAccountInput {
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
}

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_EXT = ['png', 'jpg', 'jpeg', 'webp'];

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autorizado');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json() as Promise<T>;
}

export const accountService = {
  async getProfile(): Promise<AccountProfile> {
    const res = await fetch('/api/account/profile', { headers: await authHeaders() });
    return handle<AccountProfile>(res, 'Error al cargar tu perfil');
  },

  async updateProfile(input: UpdateAccountInput): Promise<AccountProfile> {
    const res = await fetch('/api/account/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(input),
    });
    return handle<AccountProfile>(res, 'Error al actualizar tu perfil');
  },

  /**
   * Sube la foto a Storage bajo la carpeta del propio usuario (mismo patrón
   * que candidatePortalService.uploadCv) y guarda la URL resultante.
   */
  async uploadAvatar(file: File): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autorizado');

    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error('La imagen supera los 3 MB');
    }
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_AVATAR_EXT.includes(ext)) {
      throw new Error(`Formato no permitido. Usa: ${ALLOWED_AVATAR_EXT.join(', ')}`);
    }

    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await accountService.updateProfile({ avatar_url: publicUrl });
    return publicUrl;
  },
};
