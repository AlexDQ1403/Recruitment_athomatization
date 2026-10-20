'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { QueryProvider, createQueryClient } from '../ui/QueryProvider';
import { ConfirmModal } from '../ui/ConfirmModal';
import { LandingThemeProvider } from '../landing/ThemeToggle';
import { getStoredUser, setStoredUser, clearAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { User } from '../../types';

/** Rutas que solo puede ver el rol 'candidato'. */
const CANDIDATE_HOME = '/candidate/profile';
const COMPANY_HOME = '/dashboard';

/**
 * Chat y su historial son herramientas operativas del reclutador; Empresa no
 * las tiene (ver requireRole('recruiter') en /api/chat, backend/src/app.ts).
 * El backend ya rechaza estas rutas para empresa — esto es solo para que no
 * aterrice en una pantalla vacía/con error 403.
 */
const RECRUITER_ONLY_PATHS = ['/chat', '/history'];

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // Propio de AppShell para poder vaciarlo al cerrar sesión
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { clearAuth(); router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, company_id')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        const u: User = { id: profile.id, email: profile.email, full_name: profile.full_name, role: profile.role, company_id: profile.company_id || '' };
        setStoredUser(u);
        setUser(u);

        // El rol se decide aquí, con el dato de la BD, no con lo que diga el
        // cliente. El backend vuelve a comprobarlo en cada endpoint: esto solo
        // evita que el usuario aterrice en una pantalla que no le corresponde.
        const inCandidateArea = pathname?.startsWith('/candidate') ?? false;
        if (u.role === 'candidato' && !inCandidateArea) {
          router.replace(CANDIDATE_HOME);
          return;
        }
        if (u.role !== 'candidato' && inCandidateArea) {
          router.replace(COMPANY_HOME);
          return;
        }
        if (u.role === 'empresa' && RECRUITER_ONLY_PATHS.some((p) => pathname?.startsWith(p))) {
          router.replace(COMPANY_HOME);
          return;
        }
      } else {
        const stored = getStoredUser();
        if (stored) setUser(stored);
        else router.push('/login');
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { clearAuth(); router.push('/login'); }
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    const result = await clearAuth();

    // Vacía la caché en memoria: candidatos, reclutadores y reportes de la
    // sesión anterior no deben sobrevivir a un cambio de usuario en la misma
    // pestaña.
    queryClient.clear();

    if (!result.ok) {
      // La sesión local ya está limpia, así que se sale igualmente; solo se
      // avisa de que el servidor puede no haberla revocado.
      console.warn('Cierre de sesión incompleto en el servidor:', result.error);
    }

    setLogoutConfirm(false);
    setLoggingOut(false);
    router.replace('/login');
  };

  if (!user) return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--bg)' }} aria-label="Cargando">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="status" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: `dotRise .9s ${i * 0.15}s infinite` }} />
        ))}
        <span className="sr-only">Cargando...</span>
      </div>
    </div>
  );

  return (
    <LandingThemeProvider>
    <QueryProvider client={queryClient}>
      {logoutConfirm && (
        <ConfirmModal
          message="¿Cerrar la sesión actual? Se cerrará también en tus otros dispositivos."
          confirmLabel={loggingOut ? 'Cerrando...' : 'Cerrar sesión'}
          onConfirm={handleLogout}
          onCancel={() => setLogoutConfirm(false)}
        />
      )}

      <div className="app-layout">
        {/* Botón hamburguesa — solo visible en móvil */}
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={sidebarOpen}
          aria-controls="sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <Sidebar
          user={user}
          onLogout={() => setLogoutConfirm(true)}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="main-content" id="main-content">{children}</main>
      </div>
    </QueryProvider>
    </LandingThemeProvider>
  );
};
