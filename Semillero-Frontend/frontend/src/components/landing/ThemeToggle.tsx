'use client';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import styles from './landing.module.css';

export type LandingTheme = 'dark' | 'light';

const STORAGE_KEY = 'semillero_theme';
const ATTR = 'data-landing-theme';

// Se ejecuta antes de pintar la página para aplicar el tema guardado sin parpadeo
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('${ATTR}',t)}catch(e){}})()`;

const ThemeContext = createContext<{ theme: LandingTheme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});

export const useLandingTheme = () => useContext(ThemeContext);

export function LandingThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<LandingTheme>('dark');

  useEffect(() => {
    setTheme(document.documentElement.getAttribute(ATTR) === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next: LandingTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute(ATTR, next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // sin almacenamiento disponible: el tema dura solo esta visita
    }
  };

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useLandingTheme();
  const toLight = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className={styles.themeToggle}
      aria-label={toLight ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={toLight ? 'Modo claro' : 'Modo oscuro'}
    >
      {toLight ? (
        <svg key="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg key="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
