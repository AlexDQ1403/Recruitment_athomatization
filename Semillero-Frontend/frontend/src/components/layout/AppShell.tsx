'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { QueryProvider } from '../ui/QueryProvider';
import { getStoredUser, setStoredUser, clearAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { User } from '../../types';

/** Rutas que solo puede ver el rol 'candidato'. */
const CANDIDATE_HOME = '/candidate/profile';
const COMPANY_HOME = '/dashboard';

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const handleLogout = async () => { await clearAuth(); router.push('/login'); };

  if (!user) return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--bg)' }} aria-label="Cargando">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="status" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: `bounce .9s ${i * 0.15}s infinite` }} />
        ))}
        <span className="sr-only">Cargando...</span>
      </div>
    </div>
  );

  return (
    <QueryProvider>
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
          onLogout={handleLogout}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="main-content" id="main-content">{children}</main>
      </div>
    </QueryProvider>
  );
};
