'use client';
import { useState } from 'react';
import Link from 'next/link';
import { registerService, validatePassword } from '../../services/registerService';

type Variant = 'company' | 'candidate';

const COPY: Record<Variant, { title: string; subtitle: string; cta: string }> = {
  company: {
    title: 'Registra tu empresa',
    subtitle: 'Crea la cuenta administradora de tu organización',
    cta: 'Crear cuenta de empresa',
  },
  candidate: {
    title: 'Crea tu perfil',
    subtitle: 'Postúlate a vacantes y deja que las empresas te encuentren',
    cta: 'Crear cuenta de candidato',
  },
};

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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">S</div>
            <span className="auth-logo-name">Semillero</span>
          </div>
          <h2>Revisa tu correo</h2>
          <p className="subtitle">
            Enviamos un enlace de confirmación a <strong>{form.email}</strong>. Debes
            confirmar tu cuenta antes de iniciar sesión.
          </p>
          <Link href="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">S</div>
          <span className="auth-logo-name">Semillero</span>
        </div>

        <h2>{copy.title}</h2>
        <p className="subtitle">{copy.subtitle}</p>

        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          {variant === 'company' && (
            <>
              <div className="form-group">
                <label htmlFor="company_name">Nombre de la empresa</label>
                <input
                  id="company_name"
                  value={form.company_name}
                  onChange={set('company_name')}
                  placeholder="Acme S.A.S."
                  required
                  minLength={2}
                  maxLength={120}
                />
              </div>
              <div className="form-group">
                <label htmlFor="industry">Sector (opcional)</label>
                <input
                  id="industry"
                  value={form.industry}
                  onChange={set('industry')}
                  placeholder="Tecnología"
                  maxLength={120}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="full_name">
              {variant === 'company' ? 'Tu nombre completo' : 'Nombre completo'}
            </label>
            <input
              id="full_name"
              value={form.full_name}
              onChange={set('full_name')}
              placeholder="Juan Pérez"
              required
              minLength={2}
              maxLength={120}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder={variant === 'company' ? 'admin@acme.com' : 'juan@correo.com'}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="Mínimo 8 caracteres, letras y números"
              required
              autoComplete="new-password"
            />
          </div>

          {variant === 'candidate' && (
            <>
              <div className="form-group">
                <label htmlFor="position">Cargo o especialidad (opcional)</label>
                <input
                  id="position"
                  value={form.position}
                  onChange={set('position')}
                  placeholder="Desarrollador Backend"
                  maxLength={120}
                />
              </div>
              <div className="form-group">
                <label htmlFor="location">Ubicación (opcional)</label>
                <input
                  id="location"
                  value={form.location}
                  onChange={set('location')}
                  placeholder="Medellín"
                  maxLength={120}
                />
              </div>
              <div className="form-group">
                <label htmlFor="experience_years">Años de experiencia (opcional)</label>
                <input
                  id="experience_years"
                  type="number"
                  min={0}
                  max={60}
                  value={form.experience_years}
                  onChange={set('experience_years')}
                  placeholder="3"
                />
              </div>
            </>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creando cuenta...' : copy.cta}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 20, textAlign: 'center' }}>
          <Link href="/register">← Cambiar tipo de cuenta</Link>
        </p>
      </div>
    </div>
  );
};
