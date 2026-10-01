'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../../services/authService';
import { AuthLayout, PasswordInput, SemiState, useIdleTips, useSemiEyes, useSemiRefs } from './AuthLayout';
import landing from '../landing/landing.module.css';
import styles from './auth.module.css';

type Field = 'none' | 'password' | 'confirm';

const IDLE_TIPS: SemiState[] = [
  { pose: 'chat', mood: 'normal', say: 'Elige una contraseña que no hayas usado antes.' },
  { pose: 'roles', mood: 'normal', say: 'Necesita 8 caracteres o más, con letras y números.' },
  { pose: 'inicio', mood: 'happy', say: 'Después la escribes otra vez para confirmar. ¡Y listo!' },
];

export const ResetPasswordForm = () => {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<Field>('none');
  const [showPassword, setShowPassword] = useState(false);
  const { eyesRef, semiRef } = useSemiRefs();

  const tip = useIdleTips(field === 'none' && !loading && !done);
  useSemiEyes(eyesRef, semiRef, null);

  const checks = [
    { ok: password.length >= 8, label: '8 caracteres o más' },
    { ok: /[a-zA-Z]/.test(password) && /[0-9]/.test(password), label: 'Letras y números' },
    { ok: password === confirm && confirm.length > 0, label: 'Coinciden' },
  ];
  const strong = checks[0].ok && checks[1].ok;
  const matches = checks[2].ok;

  const validate = () => {
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
      return 'Debe contener letras y números (alfanumérica)';
    if (password !== confirm) return 'Las contraseñas no coinciden';
    return null;
  };

  const semi = ((): SemiState => {
    if (done) return { pose: 'empezar', mood: 'love', say: '¡Contraseña nueva guardada! Te llevo a iniciar sesión…' };
    if (loading) return { pose: 'chat', mood: 'normal', say: 'Guardando tu nueva contraseña…' };
    if (error) return { pose: 'roles', mood: 'wow', say: 'Uy, algo no está bien. Revisa el mensaje en rojo.' };
    if (field !== 'none' && showPassword) return { pose: 'peekOne', mood: 'wow', say: 'Ups, ¡la estoy viendo! Mejor ocúltala.' };
    if (field === 'password') {
      return strong
        ? { pose: 'peek', mood: 'happy', say: '¡Esa se ve segura! 💪 Ahora confírmala abajo.' }
        : { pose: 'peek', mood: 'shy', say: 'No miro 🙈 Usa 8 caracteres o más, con letras y números.' };
    }
    if (field === 'confirm') {
      if (matches) return { pose: 'peek', mood: 'happy', say: '¡Coinciden! Ya puedes guardarla.' };
      if (confirm.length >= password.length && confirm.length > 0)
        return { pose: 'peek', mood: 'wow', say: 'Mmm, todavía no coinciden. Revísala.' };
      return { pose: 'peek', mood: 'shy', say: 'Escríbela otra vez, sin mirar 🙈' };
    }
    if (tip >= 0) return IDLE_TIPS[tip % IDLE_TIPS.length];
    return { pose: 'inicio', mood: 'happy', say: '¡Bienvenido de vuelta! Creemos una contraseña nueva.' };
  })();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authService.updatePassword(password);
      setDone(true);
      router.push('/login?reset=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restablecer contraseña');
    } finally {
      setLoading(false);
    }
  };

  const focus = (k: Field) => ({ onFocus: () => setField(k), onBlur: () => setField('none') });

  return (
    <AuthLayout
      heading="Elige una contraseña nueva."
      semi={semi}
      shake={!!error && !loading}
      eyesRef={eyesRef}
      semiRef={semiRef}
    >
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Nueva contraseña</h2>
        <p className={styles.cardSubtitle}>Elige una contraseña segura para tu cuenta</p>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="password">Nueva contraseña</label>
            <PasswordInput
              id="password"
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              {...focus('password')}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm">Confirmar contraseña</label>
            <PasswordInput
              id="confirm"
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              {...focus('confirm')}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
              required
              aria-describedby="password-rules"
            />
            <ul id="password-rules" className={styles.rules}>
              {checks.map((c) => (
                <li key={c.label} data-ok={c.ok}>
                  <span aria-hidden="true">{c.ok ? '✓' : '•'}</span>
                  {c.label}
                </li>
              ))}
            </ul>
          </div>

          <button type="submit" className={`${landing.pill} ${styles.submit}`} data-loading={loading} disabled={loading || done}>
            {loading ? 'Guardando…' : 'Establecer nueva contraseña'}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
};
