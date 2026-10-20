import { Scope_One } from 'next/font/google';
import { ReactNode } from 'react';
import { LandingThemeProvider } from './ThemeToggle';

const scopeOne = Scope_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-scope',
  display: 'swap',
});

// Envoltura común de las páginas públicas (inicio, login): fuente y tema claro/oscuro (el script de inicio va en el layout raíz)
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className={scopeOne.variable}>
      <LandingThemeProvider>{children}</LandingThemeProvider>
    </div>
  );
}
