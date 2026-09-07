'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { authService } from '../../services/authService';

export const ForgotPasswordForm = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authService.sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar correo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">S</div>
          <span className="auth-logo-name">Semillero</span>
        </div>

        {sent ? (
          <>
            <h2>Correo enviado</h2>
            <p className="subtitle" style={{ marginBottom: 24 }}>
              Revisa tu bandeja de entrada. Te enviamos un enlace para restablecer tu contraseña.
            </p>
            <Link href="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Volver al inicio de sesión
            </Link>
          </>
        ) : (
          <>
            <h2>Recuperar contraseña</h2>
            <p className="subtitle">Ingresa tu correo y te enviamos un enlace de recuperación</p>

            {error && <div className="form-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Correo electrónico</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com" required autoFocus />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </button>
            </form>

            <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
              <Link href="/login">Volver al inicio de sesión</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
