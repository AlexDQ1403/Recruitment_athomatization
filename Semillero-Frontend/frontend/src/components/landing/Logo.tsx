import Link from 'next/link';
import styles from './landing.module.css';

// Marca de Semillero; cada instancia necesita su propio id de degradado para tomar los colores de su zona
export function Logo({ id = 'semillero-mark' }: { id?: string }) {
  return (
    <Link href="/" className={styles.logo} aria-label="Semillero, inicio">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--logo-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--logo-b)' }} />
          </linearGradient>
        </defs>
        <path d="M12 2 22 20H2z" fill={`url(#${id})`} />
        <path d="M12 9.5 16.2 17H7.8z" style={{ fill: 'var(--bg)' }} />
      </svg>
      <span>Semillero</span>
    </Link>
  );
}
