'use client';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '../../services/authService';
import { setStoredUser } from '../../lib/auth';
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
  const [error, setError] = useState<string | null>(null);
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
    try {
      const user = await authService.login(email, password);
      setStoredUser(user);
      setDone(true);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      label="Bienvenido de nuevo"
      heading="Tu próximo paso empieza aquí."
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
              onFocus={() => setField('email')}
              onBlur={() => setField('none')}
              placeholder="tu@email.com"
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="password">Contraseña</label>
              <Link href="/forgot-password" className={styles.smallLink}>
                ¿La olvidaste?
              </Link>
            </div>
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
