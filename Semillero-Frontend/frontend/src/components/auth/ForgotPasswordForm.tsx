'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { authService } from '../../services/authService';
import { AuthLayout, SemiState, useIdleTips, useSemiEyes, useSemiRefs } from './AuthLayout';
import landing from '../landing/landing.module.css';
import styles from './auth.module.css';

// Consejos si la persona se queda un rato quieta
const IDLE_TIPS: SemiState[] = [
  { pose: 'chat', mood: 'normal', say: 'Te llegará un enlace al correo para crear una contraseña nueva.' },
  { pose: 'roles', mood: 'normal', say: 'Usa el mismo correo con el que creaste tu cuenta.' },
  { pose: 'inicio', mood: 'happy', say: '¿Ya te acordaste? Vuelve a iniciar sesión con el enlace de abajo.' },
];

export const ForgotPasswordForm = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const { eyesRef, semiRef } = useSemiRefs();

  const tip = useIdleTips(!focused && !loading && !sent);
  useSemiEyes(eyesRef, semiRef, focused ? email : null);

  const semi = ((): SemiState => {
    if (sent) return { pose: 'empezar', mood: 'love', say: '¡Listo! Revisa tu bandeja de entrada (y el spam, por si acaso).' };
    if (loading) return { pose: 'chat', mood: 'normal', say: 'Enviando el enlace…' };
    if (error) return { pose: 'roles', mood: 'wow', say: 'Uy, no pude enviarlo. Revisa el correo e inténtalo otra vez.' };
    if (focused) return { pose: 'chat', mood: 'normal', say: 'Escribe tu correo, yo te sigo.' };
    if (tip >= 0) return IDLE_TIPS[tip % IDLE_TIPS.length];
    return { pose: 'roles', mood: 'happy', say: '¿Se te olvidó? Tranquilo, a mí también me pasa. Te ayudo.' };
  })();

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
    <AuthLayout
      heading="A todos se nos olvida algo."
      semi={semi}
      shake={!!error && !loading}
      eyesRef={eyesRef}
      semiRef={semiRef}
    >
      {sent ? (
        <div className={styles.card}>
          <div className={styles.doneIcon} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="3" />
              <path d="M22 7l-10 6L2 7" />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Correo enviado</h2>
          <p className={styles.cardSubtitle}>
            Si <strong>{email}</strong> tiene una cuenta, te llegará un enlace para restablecer tu
            contraseña.
          </p>
          <Link href="/login" className={`${landing.pill} ${styles.submit} ${styles.doneCta}`}>
            Volver a iniciar sesión
          </Link>
          <p className={styles.switch}>
            ¿No te llegó?{' '}
            <button type="button" className={styles.linkButton} onClick={() => setSent(false)}>
              Intentar de nuevo
            </button>
          </p>
        </div>
      ) : (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Recuperar contraseña</h2>
          <p className={styles.cardSubtitle}>Ingresa tu correo y te enviamos un enlace de recuperación</p>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="tu@email.com"
                autoComplete="email"
                required
              />
            </div>
            <button type="submit" className={`${landing.pill} ${styles.submit}`} data-loading={loading} disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
            </button>
          </form>

          <p className={styles.switch}>
            <Link href="/login">← Volver a iniciar sesión</Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
};
