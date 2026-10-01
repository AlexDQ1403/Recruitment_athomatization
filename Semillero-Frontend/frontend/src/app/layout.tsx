import type { Metadata } from 'next';
import { Scope_One, Rum_Raisin, JetBrains_Mono, Montserrat } from 'next/font/google';
import '../styles/globals.css';
import { themeInitScript } from '../lib/theme';

const scopeOne = Scope_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-syne',
  display: 'swap',
});

const rumRaisinStatic = Rum_Raisin({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-rum-raisin',
  display: 'swap',
});

// fuente del logo (geométrica, como el diseño de la marca)
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: '600',
  variable: '--font-brand',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kmella — Reclutamiento',
  description: 'Gestión de candidatos y pipeline de reclutamiento',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${scopeOne.variable} ${rumRaisinStatic.variable} ${jetbrainsMono.variable} ${montserrat.variable}`}>
      <body>
        {/* aplica el tema guardado (claro/oscuro) antes de pintar, en la web pública y en la app */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
