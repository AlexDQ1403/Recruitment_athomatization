'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '../../services/authService';
import { setStoredUser, touchSession, reportFailedLogin } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { mapAuthError, AuthAlert } from '../../lib/authErrors';
import { Alert } from '../ui/Alert';

export const LoginForm = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AuthAlert | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAlert(null);
    setResent(false);
    try {
      const user = await authService.login(email, password);
      setStoredUser(user);

      // Marca el acceso (last_login + auditoría). No bloquea la entrada.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await touchSession(session.access_token);

      // El destino lo decide el rol que acaba de leerse de la BD
      router.push(user.role === 'candidato' ? '/candidate/profile' : '/dashboard');
    } catch (err) {
      const mapped = mapAuthError(err);
      setAlert(mapped);
      // Deja traza del intento fallido para detectar fuerza bruta.
      // No espera la respuesta: no debe retrasar el aviso al usuario.
      reportFailedLogin(mapped.kind);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authService.resendConfirmation(email);
      setResent(true);
      setAlert(null);
    } catch (err) {
      setAlert(mapAuthError(err));
    } finally {
      setResending(false);
    }
  };

  /** La acción que resuelve la causa concreta del fallo. */
  const alertActions = (() => {
    if (!alert) return undefined;
    switch (alert.action.type) {
      case 'resend_confirmation':
        return [{ label: 'Reenviar correo de confirmación', onClick: handleResend, loading: resending }];
      case 'go_register':
        return [
          { label: 'Crear una cuenta', href: '/register' },
          { label: 'Restablecer contraseña', href: '/forgot-password' },
        ];
      case 'go_reset_password':
        return [{ label: 'Restablecer contraseña', href: '/forgot-password' }];
      default:
        return undefined;
    }
  })();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">S</div>
          <span className="auth-logo-name">Semillero</span>
        </div>

        <h2>Iniciar sesión</h2>
        <p className="subtitle">Ingresa tus credenciales para continuar</p>

        {alert && (
          <Alert
            severity={alert.severity}
            title={alert.title}
            detail={alert.detail}
            actions={alertActions}
            onDismiss={() => setAlert(null)}
          />
        )}

        {resent && (
          <Alert
            severity="success"
            title="Correo de confirmación enviado"
            detail={`Revisa la bandeja de ${email}. El enlace caduca en 24 horas.`}
            onDismiss={() => setResent(false)}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com" required autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
          <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
        </p>
        <p style={{ marginTop: 8, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
          ¿No tienes cuenta? <Link href="/register">Regístrate</Link>
        </p>
      </div>
    </div>
  );
};
