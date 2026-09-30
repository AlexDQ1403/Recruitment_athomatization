'use client';
import { useState } from 'react';
import Link from 'next/link';
import { registerService, validatePassword } from '../../services/registerService';
import { AuthLayout, PasswordInput, SemiState, useIdleTips, useSemiEyes, useSemiRefs } from './AuthLayout';
import landing from '../landing/landing.module.css';
import styles from './auth.module.css';

type Variant = 'company' | 'candidate';
type Field =
  | 'none'
  | 'company_name'
  | 'industry'
  | 'full_name'
  | 'email'
  | 'password'
  | 'position'
  | 'location'
  | 'experience_years';

const COPY: Record<Variant, { label: string; heading: string; title: string; subtitle: string; cta: string }> = {
  company: {
    label: 'Cuenta de empresa',
    heading: 'Encuentra a tu próximo gran talento.',
    title: 'Registra tu empresa',
    subtitle: 'Crea la cuenta administradora de tu organización',
    cta: 'Crear cuenta de empresa',
  },
  candidate: {
    label: 'Cuenta de candidato',
    heading: 'Tu próxima oportunidad te está buscando.',
    title: 'Crea tu perfil',
    subtitle: 'Postúlate a vacantes y deja que las empresas te encuentren',
    cta: 'Crear cuenta de candidato',
  },
};

// Lo que dice Semi al entrar a cada campo
const FIELD_SAY: Partial<Record<Field, SemiState>> = {
  company_name: { pose: 'chat', mood: 'normal', say: '¿Cómo se llama tu empresa? Así la verán los candidatos.' },
  industry: { pose: 'roles', mood: 'normal', say: 'El sector es opcional, pero ayuda a que te conozcan.' },
  email: { pose: 'chat', mood: 'normal', say: 'Escribe tu correo: ahí te llegará el enlace para confirmar la cuenta.' },
  position: { pose: 'chat', mood: 'normal', say: '¿En qué eres experto? Así te encuentran las empresas.' },
  location: { pose: 'roles', mood: 'normal', say: '¿Dónde estás? Hay vacantes presenciales, remotas e híbridas.' },
  experience_years: { pose: 'chat', mood: 'normal', say: 'Cuenta todo: prácticas y proyectos también valen.' },
};

// Consejos si la persona se queda un rato quieta
const IDLE_TIPS: Record<Variant, SemiState[]> = {
  company: [
    { pose: 'roles', mood: 'normal', say: 'Solo pedimos lo esencial. Lo demás lo completas después.' },
    { pose: 'inicio', mood: 'happy', say: 'Con tu cuenta podrás publicar vacantes y sumar a tus reclutadores.' },
    { pose: 'chat', mood: 'normal', say: 'Y buscar candidatos escribiéndome como a un colega. ¡Te va a gustar!' },
  ],
  candidate: [
    { pose: 'roles', mood: 'normal', say: 'Los campos opcionales ayudan a que las empresas te encuentren.' },
    { pose: 'inicio', mood: 'happy', say: 'Después podrás subir tu hoja de vida desde tu perfil.' },
    { pose: 'chat', mood: 'normal', say: 'Y seguir el estado de cada postulación en un solo lugar.' },
  ],
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export const RegisterForm = ({ variant }: { variant: Variant }) => {
  const copy = COPY[variant];

  const [form, setForm] = useState({
    company_name: '',
    industry: '',
    full_name: '',
    email: '',
    password: '',
    position: '',
    location: '',
    experience_years: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [field, setField] = useState<Field>('none');
  const [showPassword, setShowPassword] = useState(false);
  const { eyesRef, semiRef } = useSemiRefs();

  const tip = useIdleTips(field === 'none' && !loading && !done);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const focus = (k: Field) => ({
    onFocus: () => setField(k),
    onBlur: () => setField('none'),
  });

  // Requisitos de la contraseña (misma regla que validatePassword y el backend)
  const checks = [
    { ok: form.password.length >= 8, label: '8 caracteres o más' },
    { ok: /[a-zA-Z]/.test(form.password), label: 'Letras' },
    { ok: /[0-9]/.test(form.password), label: 'Números' },
  ];
  const passwordOk = validatePassword(form.password) === null;

  const semi = ((): SemiState => {
    if (done) return { pose: 'empezar', mood: 'love', say: `¡Ya casi${firstName(form.full_name) ? `, ${firstName(form.full_name)}` : ''}! Revisa tu correo para confirmar la cuenta.` };
    if (loading) return { pose: 'chat', mood: 'normal', say: 'Creando tu cuenta…' };
    if (error) return { pose: 'roles', mood: 'wow', say: 'Uy, algo falló. Revisa el mensaje en rojo y lo intentamos de nuevo.' };
    if (field === 'password') {
      if (showPassword) return { pose: 'peekOne', mood: 'wow', say: 'Ups, ¡la estoy viendo! Mejor ocúltala.' };
      if (passwordOk) return { pose: 'peek', mood: 'happy', say: '¡Esa contraseña se ve segura! 💪' };
      return { pose: 'peek', mood: 'shy', say: 'No miro 🙈 Usa 8 caracteres o más, con letras y números.' };
    }
    if (field === 'full_name') {
      const name = firstName(form.full_name);
      return name.length >= 2
        ? { pose: 'inicio', mood: 'happy', say: `¡Mucho gusto, ${name}! Yo soy Semi.` }
        : { pose: 'chat', mood: 'normal', say: '¿Cómo te llamas? Me encanta conocer gente nueva.' };
    }
    if (field !== 'none') return FIELD_SAY[field] ?? { pose: 'chat', mood: 'normal', say: 'Te sigo…' };
    if (tip >= 0) return IDLE_TIPS[variant][tip % IDLE_TIPS[variant].length];
    return variant === 'company'
      ? { pose: 'inicio', mood: 'happy', say: '¡Qué bien que tu empresa llegue a Semillero! Te ayudo a registrarla.' }
      : { pose: 'inicio', mood: 'happy', say: '¡Bienvenido! Creemos tu perfil para que las empresas te encuentren.' };
  })();

  const typing =
    field !== 'none' && field !== 'password' ? String(form[field as keyof typeof form] ?? '') : null;
  useSemiEyes(eyesRef, semiRef, typing);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validación en cliente: conveniencia, nunca la única barrera.
    // El backend revalida todo con Zod.
    const passwordError = validatePassword(form.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      if (variant === 'company') {
        await registerService.registerCompany({
          company_name: form.company_name.trim(),
          industry: form.industry.trim() || undefined,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
        });
      } else {
        await registerService.registerCandidate({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
          position: form.position.trim() || undefined,
          location: form.location.trim() || undefined,
          experience_years: form.experience_years ? Number(form.experience_years) : undefined,
        });
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el registro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      label={copy.label}
      heading={copy.heading}
      semi={semi}
      shake={!!error && !loading}
      eyesRef={eyesRef}
      semiRef={semiRef}
    >
      {done ? (
        <div className={styles.card}>
          <div className={styles.doneIcon} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="3" />
              <path d="M22 7l-10 6L2 7" />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Revisa tu correo</h2>
          <p className={styles.cardSubtitle}>
            Enviamos un enlace de confirmación a <strong>{form.email}</strong>. Debes confirmar tu
            cuenta antes de iniciar sesión.
          </p>
          <Link href="/login" className={`${landing.pill} ${styles.submit} ${styles.doneCta}`}>
            Ir a iniciar sesión
          </Link>
        </div>
      ) : (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{copy.title}</h2>
          <p className={styles.cardSubtitle}>{copy.subtitle}</p>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {variant === 'company' && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="company_name">Nombre de la empresa</label>
                  <input
                    id="company_name"
                    value={form.company_name}
                    onChange={set('company_name')}
                    {...focus('company_name')}
                    placeholder="Acme S.A.S."
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="industry">Sector <span className={styles.optional}>(opcional)</span></label>
                  <input
                    id="industry"
                    value={form.industry}
                    onChange={set('industry')}
                    {...focus('industry')}
                    placeholder="Tecnología"
                    maxLength={120}
                  />
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="full_name">
                {variant === 'company' ? 'Tu nombre completo' : 'Nombre completo'}
              </label>
              <input
                id="full_name"
                value={form.full_name}
                onChange={set('full_name')}
                {...focus('full_name')}
                placeholder="Juan Pérez"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={set('email')}
                {...focus('email')}
                placeholder={variant === 'company' ? 'admin@acme.com' : 'juan@correo.com'}
                required
                autoComplete="email"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Contraseña</label>
              <PasswordInput
                id="password"
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                value={form.password}
                onChange={set('password')}
                {...focus('password')}
                placeholder="Mínimo 8 caracteres, letras y números"
                required
                autoComplete="new-password"
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

            {variant === 'candidate' && (
              <>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label htmlFor="position">Cargo o especialidad <span className={styles.optional}>(opcional)</span></label>
                    <input
                      id="position"
                      value={form.position}
                      onChange={set('position')}
                      {...focus('position')}
                      placeholder="Desarrollador Backend"
                      maxLength={120}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="location">Ubicación <span className={styles.optional}>(opcional)</span></label>
                    <input
                      id="location"
                      value={form.location}
                      onChange={set('location')}
                      {...focus('location')}
                      placeholder="Medellín"
                      maxLength={120}
                    />
                  </div>
                </div>
                <div className={styles.field}>
                  <label htmlFor="experience_years">Años de experiencia <span className={styles.optional}>(opcional)</span></label>
                  <input
                    id="experience_years"
                    type="number"
                    min={0}
                    max={60}
                    value={form.experience_years}
                    onChange={set('experience_years')}
                    {...focus('experience_years')}
                    placeholder="3"
                  />
                </div>
              </>
            )}

            <button type="submit" className={`${landing.pill} ${styles.submit}`} data-loading={loading} disabled={loading}>
              {loading ? 'Creando cuenta…' : copy.cta}
            </button>
          </form>

          <p className={styles.switch}>
            <Link href="/register">← Cambiar tipo de cuenta</Link>
            <span className={styles.switchSep} aria-hidden="true">·</span>
            ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
};
