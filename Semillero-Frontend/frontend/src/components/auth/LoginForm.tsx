'use client';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '../../services/authService';
import { setStoredUser, touchSession, reportFailedLogin } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { mapAuthError, AuthAlert } from '../../lib/authErrors';
import { AuthLayout, PasswordInput, SemiState, useIdleTips, useSemiEyes, useSemiRefs } from './AuthLayout';
import landing from '../landing/landing.module.css';
import styles from './auth.module.css';

type Field = 'none' | 'email' | 'password';

// Si la persona se queda un rato sin escribir, Semi le cuenta para qué sirve entrar
const IDLE_AFTER = 4000;
const TIP_EVERY = 6500;
const IDLE_TIPS: SemiState[] = [
  { pose: 'roles', mood: 'normal', say: '¿Eres empresa? Entra para seguir tus vacantes y encontrar candidatos con la IA.' },
  { pose: 'inicio', mood: 'happy', say: '¿Buscas empleo? Aquí revisas tu perfil y el estado de tus postulaciones.' },
  { pose: 'chat', mood: 'normal', say: '¿Aún no tienes cuenta? Créala en un minuto, el enlace está abajo del formulario.' },
];

// Qué hace Semi según lo que pasa en el formulario
function semiState(field: Field, showPassword: boolean, loading: boolean, error: boolean, done: boolean, tip: number, justReset: boolean): SemiState {
  if (done) return { pose: 'empezar', mood: 'love', say: '¡Listo! Te llevo a tu cuenta…' };
  if (loading) return { pose: 'chat', mood: 'normal', say: 'Revisando tus datos…' };
  if (error) return { pose: 'roles', mood: 'wow', say: 'Mmm, algo no coincide. ¿Lo intentamos otra vez?' };
  if (field === 'password' && showPassword) return { pose: 'peekOne', mood: 'wow', say: 'Ups, ¡la estoy viendo! Mejor ocúltala.' };
  if (field === 'password') return { pose: 'peek', mood: 'shy', say: 'No miro, lo prometo 🙈' };
  if (field === 'none' && tip >= 0) return IDLE_TIPS[tip % IDLE_TIPS.length];
  if (justReset && field === 'none') return { pose: 'empezar', mood: 'love', say: '¡Contraseña actualizada! Ya puedes entrar con la nueva.' };
  if (field === 'email') return { pose: 'chat', mood: 'normal', say: 'Escribe tu correo, yo te sigo.' };
  return { pose: 'inicio', mood: 'happy', say: '¡Hola! Ya seas empresa o candidato, qué bueno verte.' };
}

export const LoginForm = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthAlert | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [done, setDone] = useState(false);
  const [field, setField] = useState<Field>('none');
  const [showPassword, setShowPassword] = useState(false);
  const { eyesRef, semiRef } = useSemiRefs();
  // viene de /reset-password (?reset=1): Semi celebra el cambio de contraseña
  const [justReset, setJustReset] = useState(false);
  useEffect(() => {
    setJustReset(new URLSearchParams(window.location.search).get('reset') === '1');
  }, []);

  const tip = useIdleTips(field === 'none' && !loading && !done, IDLE_AFTER, TIP_EVERY);
  const semi = semiState(field, showPassword, loading, !!error, done, tip, justReset);
  useSemiEyes(eyesRef, semiRef, field === 'email' ? email : null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResent(false);
    try {
      const user = await authService.login(email, password);
      setStoredUser(user);

      // Marca el acceso (last_login + auditoría). No bloquea la entrada.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await touchSession(session.access_token);

      setDone(true);
      // El destino lo decide el rol que acaba de leerse de la BD
      router.push(user.role === 'candidato' ? '/candidate/profile' : '/dashboard');
    } catch (err) {
      const mapped = mapAuthError(err);
      setError(mapped);
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
      setError(null);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      heading="Qué bueno verte otra vez."
      semi={semi}
      shake={!!error && !loading}
      eyesRef={eyesRef}
      semiRef={semiRef}
    >
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Iniciar sesión</h2>
        <p className={styles.cardSubtitle}>Entra con tu cuenta de empresa, reclutador o candidato</p>

        {error && (
          <div className={styles.error} role="alert">
            <strong>{error.title}</strong> {error.detail}
            {error.action.type === 'resend_confirmation' && (
              <>
                {' '}
                <button type="button" className={styles.smallLink} onClick={handleResend} disabled={resending}>
                  {resending ? 'Reenviando…' : 'Reenviar correo de confirmación'}
                </button>
              </>
            )}
            {error.action.type === 'go_register' && (
              <> <Link href="/register" className={styles.smallLink}>Crear una cuenta</Link> · <Link href="/forgot-password" className={styles.smallLink}>Restablecer contraseña</Link></>
            )}
            {error.action.type === 'go_reset_password' && (
              <> <Link href="/forgot-password" className={styles.smallLink}>Restablecer contraseña</Link></>
            )}
          </div>
        )}

        {resent && (
          <div className={styles.error} role="status">
            <strong>Correo de confirmación enviado.</strong> Revisa la bandeja de {email}. El enlace caduca en 24 horas.
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
              onFocus={() => setField('email')}
              onBlur={() => setField('none')}
              placeholder="tu@email.com"
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Contraseña</label>
            <PasswordInput
              id="password"
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setField('password')}
              onBlur={() => setField('none')}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <Link href="/forgot-password" className={`${styles.smallLink} ${styles.forgotLink}`}>
              ¿La olvidaste?
            </Link>
          </div>

          <button type="submit" className={`${landing.pill} ${styles.submit}`} data-loading={loading} disabled={loading || done}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className={styles.switch}>
          ¿No tienes cuenta? <Link href="/register">Crear cuenta</Link>
        </p>
      </div>
    </AuthLayout>
  );
};
