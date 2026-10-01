'use client';
import Link from 'next/link';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getStoredUser } from '../../lib/auth';
import { User } from '../../types';
import { BrandLogo } from '../ui/BrandMark';
import styles from './landing.module.css';

const SECTIONS = [
  { href: '#chat', label: 'Búsqueda IA' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#roles', label: 'Para quién' },
];

// Menú de celular: un panel que entra desde la derecha (del lado del botón) y sale por el mismo camino.
// Se monta fuera de la barra con un portal: la barra usa backdrop-filter, que atraparía un panel fijo.
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getStoredUser());
    // el portal va dentro de la página para heredar sus colores y tema
    setHost((buttonRef.current?.closest(`.${styles.page}`) as HTMLElement | null) ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden'; // no se desplaza la página de fondo
    // foco al primer enlace cuando el panel ya está entrando
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('a, button')?.focus(), 60);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // el foco no se sale del panel mientras está abierto
      if (e.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a, button'));
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      root.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      buttonRef.current?.focus(); // el foco vuelve al botón que abrió el menú
    };
  }, [open]);

  const close = () => setOpen(false);
  const home = user?.role === 'candidato' ? '/candidate/profile' : '/dashboard';

  const drawer = (
    <div className={styles.drawerRoot} data-open={open}>
      <div className={styles.drawerOverlay} onClick={close} aria-hidden="true" />
      <div
        ref={panelRef}
        id="menu-movil"
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        aria-hidden={!open}
        {...({ inert: open ? undefined : '' } as Record<string, string | undefined>)}
      >
        <div className={styles.drawerHead}>
          <BrandLogo height={30} />
          <button type="button" className={styles.drawerClose} onClick={close} aria-label="Cerrar menú">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className={styles.drawerNav} aria-label="Secciones">
          {SECTIONS.map((s, i) => (
            <a key={s.href} href={s.href} className={styles.drawerItem} onClick={close} style={{ '--i': i } as CSSProperties}>
              {s.label}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          ))}
        </nav>

        <div className={styles.drawerActions} style={{ '--i': SECTIONS.length } as CSSProperties}>
          {user ? (
            <Link href={home} className={styles.pill} onClick={close}>Ir a mi panel</Link>
          ) : (
            <>
              <Link href="/register" className={styles.pill} onClick={close}>Crear cuenta</Link>
              <Link href="/login" className={styles.menuLogin} onClick={close}>Iniciar sesión</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.mobileMenu}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls="menu-movil"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        data-open={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* tres líneas que se transforman en una ✕ */}
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      {host && createPortal(drawer, host)}
    </div>
  );
}
