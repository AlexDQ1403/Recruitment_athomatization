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
    // Modo privado o almacenamiento lleno: la sesión de Supabase sigue siendo
    // la fuente de verdad, así que no es fatal.
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

/**
 * Avisa al backend para dejar traza del cierre de sesión.
 * Se llama ANTES de signOut, porque después el token ya no vale.
 * Los fallos se ignoran: la auditoría no puede impedir que alguien salga.
 */
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

/**
 * Cierra la sesión.
 *
 * El orden importa y los fallos no se propagan: si `signOut` falla por red y
 * dejáramos que la excepción subiera, el rastro local seguiría ahí y el usuario
 * quedaría "dentro" creyendo que salió. Por eso la limpieza local va en
 * `finally`.
 *
 * `scope: 'global'` invalida la sesión en todos los dispositivos del usuario, no
 * solo en esta pestaña. Es lo que se espera de un "cerrar sesión" en una
 * aplicación que maneja datos de candidatos.
 */
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

/**
 * Marca el acceso del usuario tras iniciar sesión (actualiza last_login y deja
 * traza de auditoría). Silencioso: no debe bloquear la entrada.
 */
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

/**
 * Notifica un intento de acceso fallido para dejar traza en el servidor.
 *
 * Envía solo el MOTIVO, nunca el correo ni la contraseña: sirve para detectar
 * picos de intentos fallidos sin acumular datos personales de quien falla al
 * escribir su correo. Silencioso y sin await en el llamador.
 */
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
