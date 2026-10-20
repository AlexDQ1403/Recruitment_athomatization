import Link from 'next/link';
import { BrandLogo } from '../ui/BrandMark';
import styles from './landing.module.css';

// Logo de Kmella que enlaza al inicio; los colores los toma de --brand-ink y --brand-camel de su zona
export function Logo({ height = 34, variant = 'auto' }: { height?: number; variant?: 'auto' | 'onred' }) {
  return (
    <Link href="/" className={styles.logo} aria-label="Kmella, inicio">
      <BrandLogo height={height} variant={variant} />
    </Link>
  );
}
