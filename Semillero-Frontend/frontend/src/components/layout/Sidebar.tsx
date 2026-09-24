'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User } from '../../types';

interface Props {
  user: User | null;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
}

const NAV = [
  {
    section: 'Principal',
    items: [
      {
        href: '/dashboard', label: 'Dashboard',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
      },
      {
        href: '/chat', label: 'Búsqueda por chat',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
      },
      {
        href: '/vacancies', label: 'Vacantes',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
      },
      {
        href: '/candidates', label: 'Candidatos',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      },
      {
        href: '/history', label: 'Historial de búsquedas',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
      },
    ],
  },
];

const SUPERADMIN_NAV = [
  {
    section: 'Administración',
    items: [
      {
        href: '/users', label: 'Usuarios',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      },
    ],
  },
];

const EMPRESA_NAV = [
  {
    section: 'Administración',
    items: [
      {
        href: '/recruiters', label: 'Gestión de Reclutadores',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      },
      {
        href: '/reports', label: 'Reportes',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
      },
    ],
  },
];

const CANDIDATO_NAV = [
  {
    section: 'Mi cuenta',
    items: [
      {
        href: '/candidate/profile', label: 'Mi perfil',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      },
      {
        href: '/candidate/applications', label: 'Vacantes y postulaciones',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
      },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin',
  empresa: 'Empresa',
  recruiter: 'Reclutador',
  candidato: 'Candidato',
};

export const Sidebar = ({ user, onLogout, open, onClose }: Props) => {
  const path = usePathname();
  const initials = user?.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() ?? '?';

  const sections = (() => {
    // El candidato no accede al área de empresa: solo ve su portal
    if (user?.role === 'candidato') {
      return CANDIDATO_NAV;
    }
    if (user?.role === 'empresa') {
      return [...NAV, ...EMPRESA_NAV];
    }
    if (user?.role === 'superAdmin') {
      return [...NAV, ...SUPERADMIN_NAV];
    }
    return NAV;
  })();

  return (
    <>
      {/* Overlay móvil */}
      {open && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} aria-label="Navegación principal">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden="true">S</div>
          <span className="sidebar-logo-text">Semillero</span>
          {/* Botón cerrar en móvil */}
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Menú">
          {sections.map((section) => (
            <div key={section.section}>
              <p className="nav-section-label">{section.section}</p>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${path.startsWith(item.href) ? ' active' : ''}`}
                  aria-current={path.startsWith(item.href) ? 'page' : undefined}
                  onClick={onClose}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar" aria-hidden="true">{initials}</div>
          <div className="user-info">
            <p className="user-name">{user?.full_name ?? 'Usuario'}</p>
            <p className="user-role">
              {ROLE_LABEL[user?.role ?? ''] ?? 'Reclutador'}
            </p>
          </div>
          <button
            onClick={onLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            style={{ color: 'var(--text-3)', fontSize: 18, padding: 4 }}
          >⎋</button>
        </div>
      </aside>
    </>
  );
};
