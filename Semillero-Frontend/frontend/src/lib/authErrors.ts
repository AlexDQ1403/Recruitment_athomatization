/**
 * Traduce los errores de Supabase Auth a alertas accionables en español.
 *
 * Por qué un tipo discriminado y no un string: la UI necesita saber QUÉ pasó
 * para ofrecer la acción correcta (reenviar confirmación, ir a registro,
 * esperar), no solo qué texto pintar.
 */

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'user_banned'
  | 'network'
  | 'unknown';

export type AuthErrorAction =
  | { type: 'resend_confirmation' }
  | { type: 'go_register' }
  | { type: 'go_reset_password' }
  | { type: 'retry_later' }
  | { type: 'none' };

export interface AuthAlert {
  kind: AuthErrorKind;
  severity: 'error' | 'warning';
  title: string;
  detail: string;
  action: AuthErrorAction;
}

/** Forma mínima de un AuthError de supabase-js, sin acoplarnos a la clase. */
interface SupabaseLikeError {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

/**
 * Códigos que Supabase devuelve en signInWithPassword.
 *
 * NOTA DE SEGURIDAD: 'invalid_credentials' cubre tanto "contraseña incorrecta"
 * como "el correo no existe". Supabase los unifica a propósito, y aquí NO se
 * separan: distinguirlos permitiría enumerar qué correos tienen cuenta. El
 * mensaje cubre ambos casos y ofrece el camino al registro, que es la ayuda que
 * necesita un usuario sin cuenta sin confirmar nada a un atacante.
 */
export function mapAuthError(err: unknown): AuthAlert {
  const e = (err ?? {}) as SupabaseLikeError;
  const code = e.code ?? '';
  const message = (e.message ?? '').toLowerCase();

  // Fallo de red: no llegamos a hablar con Supabase
  if (
    e.name === 'TypeError' ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed')
  ) {
    return {
      kind: 'network',
      severity: 'warning',
      title: 'Sin conexión con el servidor',
      detail: 'Revisa tu conexión a internet e inténtalo de nuevo.',
      action: { type: 'retry_later' },
    };
  }

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return {
      kind: 'email_not_confirmed',
      severity: 'warning',
      title: 'Tu correo aún no está confirmado',
      detail:
        'Te enviamos un enlace de confirmación al registrarte. Ábrelo para activar tu cuenta, o pide uno nuevo si no lo encuentras.',
      action: { type: 'resend_confirmation' },
    };
  }

  if (code === 'user_banned' || message.includes('banned')) {
    return {
      kind: 'user_banned',
      severity: 'error',
      title: 'Cuenta suspendida',
      detail: 'Tu acceso está deshabilitado. Contacta al administrador de tu empresa.',
      action: { type: 'none' },
    };
  }

  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    e.status === 429
  ) {
    return {
      kind: 'rate_limited',
      severity: 'warning',
      title: 'Demasiados intentos',
      detail: 'Por seguridad bloqueamos el acceso unos minutos. Vuelve a intentarlo más tarde.',
      action: { type: 'retry_later' },
    };
  }

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return {
      kind: 'invalid_credentials',
      severity: 'error',
      title: 'Correo o contraseña incorrectos',
      detail:
        'Verifica los datos. Si aún no tienes cuenta, puedes crear una; si olvidaste la contraseña, puedes restablecerla.',
      action: { type: 'go_register' },
    };
  }

  return {
    kind: 'unknown',
    severity: 'error',
    title: 'No se pudo iniciar sesión',
    detail: 'Ocurrió un problema inesperado. Inténtalo de nuevo en unos momentos.',
    action: { type: 'none' },
  };
}

/** Alertas del registro, donde el correo duplicado sí tiene código propio. */
export function mapRegisterError(err: unknown): AuthAlert {
  const e = (err ?? {}) as SupabaseLikeError;
  const message = (e.message ?? '').toLowerCase();

  if (message.includes('ya existe una empresa')) {
    return {
      kind: 'unknown',
      severity: 'error',
      title: 'Ese nombre de empresa ya está en uso',
      detail: 'Elige otro nombre, o inicia sesión si tu empresa ya tiene cuenta.',
      action: { type: 'none' },
    };
  }

  return mapAuthError(err);
}
