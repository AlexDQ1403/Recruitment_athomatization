import Link from 'next/link';

export default function RegisterChoicePage() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <div className="auth-logo">
          <div className="auth-logo-icon">S</div>
          <span className="auth-logo-name">Semillero</span>
        </div>

        <h2>Crear una cuenta</h2>
        <p className="subtitle">Elige el tipo de cuenta que necesitas</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link href="/register/company" className="role-card">
            <span className="role-card-title">Soy una empresa</span>
            <span className="role-card-desc">
              Publica vacantes, gestiona tu equipo de reclutadores y busca candidatos
            </span>
          </Link>

          <Link href="/register/candidate" className="role-card">
            <span className="role-card-title">Soy candidato</span>
            <span className="role-card-desc">
              Crea tu perfil profesional, sube tu CV y postúlate a vacantes
            </span>
          </Link>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 24, textAlign: 'center' }}>
          ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
