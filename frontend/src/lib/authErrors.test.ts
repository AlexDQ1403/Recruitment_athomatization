import { describe, it, expect } from 'vitest';
import { mapAuthError, mapRegisterError } from './authErrors';

/** Imita un AuthError de supabase-js sin depender de la clase. */
const authError = (code: string, message = '', status?: number) => ({
  code,
  message,
  status,
  name: 'AuthApiError',
});

describe('mapAuthError', () => {
  it('identifica credenciales inválidas y ofrece registro y recuperación', () => {
    const alert = mapAuthError(authError('invalid_credentials', 'Invalid login credentials'));
    expect(alert.kind).toBe('invalid_credentials');
    expect(alert.severity).toBe('error');
    expect(alert.action).toEqual({ type: 'go_register' });
  });

  it('identifica el correo sin confirmar y ofrece reenviar el enlace', () => {
    const alert = mapAuthError(authError('email_not_confirmed', 'Email not confirmed'));
    expect(alert.kind).toBe('email_not_confirmed');
    expect(alert.severity).toBe('warning');
    expect(alert.action).toEqual({ type: 'resend_confirmation' });
  });

  it('no revela si el correo existe: mismo resultado que contraseña incorrecta', () => {
    const noSuchEmail = mapAuthError(authError('invalid_credentials', 'Invalid login credentials'));
    const wrongPassword = mapAuthError(authError('invalid_credentials', 'Invalid login credentials'));
    expect(noSuchEmail).toEqual(wrongPassword);
    expect(noSuchEmail.title).not.toMatch(/no existe|no registrado|not found/i);
  });

  it('detecta el bloqueo por intentos y no sugiere reintentar de inmediato', () => {
    const alert = mapAuthError(authError('over_request_rate_limit', '', 429));
    expect(alert.kind).toBe('rate_limited');
    expect(alert.action).toEqual({ type: 'retry_later' });
  });

  it('detecta cuenta suspendida sin ofrecer acciones al usuario', () => {
    const alert = mapAuthError(authError('user_banned', 'User banned'));
    expect(alert.kind).toBe('user_banned');
    expect(alert.action).toEqual({ type: 'none' });
  });

  it('distingue un fallo de red de unas credenciales malas', () => {
    const alert = mapAuthError({ name: 'TypeError', message: 'Failed to fetch' });
    expect(alert.kind).toBe('network');
    expect(alert.severity).toBe('warning');
  });

  it('cae en unknown ante un error sin código reconocible', () => {
    expect(mapAuthError(authError('teapot', 'I am a teapot')).kind).toBe('unknown');
    expect(mapAuthError(null).kind).toBe('unknown');
    expect(mapAuthError(undefined).kind).toBe('unknown');
  });

  it('reconoce el error por mensaje cuando falta el código', () => {
    const alert = mapAuthError({ message: 'Email not confirmed' });
    expect(alert.kind).toBe('email_not_confirmed');
  });

  it('nunca deja título o detalle vacíos', () => {
    for (const code of ['invalid_credentials', 'email_not_confirmed', 'user_banned', 'nope']) {
      const alert = mapAuthError(authError(code));
      expect(alert.title.length).toBeGreaterThan(0);
      expect(alert.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('mapRegisterError', () => {
  it('explica el nombre de empresa duplicado', () => {
    const alert = mapRegisterError(new Error('Ya existe una empresa registrada con ese nombre'));
    expect(alert.title).toMatch(/nombre de empresa/i);
    expect(alert.severity).toBe('error');
  });

  it('delega en mapAuthError el resto de los casos', () => {
    expect(mapRegisterError(authError('over_request_rate_limit', '', 429)).kind).toBe('rate_limited');
  });
});
