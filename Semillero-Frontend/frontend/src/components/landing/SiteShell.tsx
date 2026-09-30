import { Inter } from 'next/font/google';
import { ReactNode } from 'react';
import { LandingThemeProvider, themeInitScript } from './ThemeToggle';

const inter = Inter({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

// Envoltura común de las páginas públicas (inicio, login): fuente, tema claro/oscuro sin parpadeo
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className={inter.variable}>
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      <LandingThemeProvider>{children}</LandingThemeProvider>
    </div>
  );
}
