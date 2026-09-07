'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../../services/authService';

export const ResetPasswordForm = () => {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = () => {
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
      return 'Debe contener letras y números (alfanumérica)';
    if (password !== confirm) return 'Las contraseñas no coinciden';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);
    try {
      await authService.updatePassword(password);
      router.push('/login?reset=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restablecer contraseña');
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

        <h2>Nueva contraseña</h2>
        <p className="subtitle">Mínimo 8 caracteres alfanuméricos</p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nueva contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres" required />
          </div>
          <div className="form-group">
            <label>Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite la contraseña" required />
          </div>

          <div className="password-hints">
            <span className={password.length >= 8 ? 'hint-ok' : 'hint'}>✓ Mínimo 8 caracteres</span>
            <span className={/[a-zA-Z]/.test(password) && /[0-9]/.test(password) ? 'hint-ok' : 'hint'}>✓ Letras y números</span>
            <span className={password === confirm && confirm.length > 0 ? 'hint-ok' : 'hint'}>✓ Contraseñas coinciden</span>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Establecer nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
};
