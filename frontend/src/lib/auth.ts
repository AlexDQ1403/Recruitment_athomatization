import { supabase } from './supabase';
import { User } from '../types';

const USER_KEY = 'semillero_user';

export const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: User) => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
  }
};

/** Borra el rastro local de la sesión. Nunca lanza. */
const clearLocalSession = () => {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignorado a propósito: no hay nada que recuperar si falla.
  }
};

/** Avisa al backend para dejar traza del cierre de sesión */
const auditLogout = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch('/api/session/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // Sin conexión al backend: se cierra la sesión igualmente.
  }
};

/** Cierra la sesión */
export const clearAuth = async (): Promise<{ ok: boolean; error?: string }> => {
  await auditLogout();

  try {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al cerrar sesión' };
  } finally {
    // Pase lo que pase, este navegador deja de considerarse autenticado.
    clearLocalSession();
  }
};

/** Marca el acceso del usuario tras iniciar sesión (actualiza last_login y deja traza de auditoría) */
export const touchSession = async (accessToken: string): Promise<void> => {
  try {
    await fetch('/api/session/touch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Irrelevante para el usuario.
  }
};

/** Notifica un intento de acceso fallido para dejar traza en el servidor */
export const reportFailedLogin = (reason: string): void => {
  try {
    void fetch('/api/session/failed-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
  } catch {
    // Nunca debe afectar al mensaje que ve el usuario.
  }
};

export const isAuthenticated = () =>
  typeof window !== 'undefined' && !!localStorage.getItem(USER_KEY);

/** AppShell escucha este evento para refrescar nombre y foto en la barra lateral tras editar el perfil. */
export const ACCOUNT_UPDATED_EVENT = 'account:updated';
