'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './legal.module.css';

const KEY = 'kmella-storage-notice';

/**
 * Aviso informativo, no un banner de consentimiento: Kmella no usa cookies de
 * publicidad ni analítica, solo almacenamiento necesario (sesión) y de preferencias.
 */
export function StorageNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { setShow(localStorage.getItem(KEY) !== '1'); } catch { /* sin almacenamiento: no insistimos */ }
  }, []);

  if (!show) return null;

  const close = () => {
    setShow(false);
    try { localStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento */ }
  };

  return (
    <div className={styles.notice} role="region" aria-label="Aviso de almacenamiento">
      <p>
        No usamos cookies de publicidad ni de analítica. Solo guardamos en tu navegador tu sesión y tus preferencias (tema,
        animaciones). <Link href="/privacidad#almacenamiento">Más información</Link>
      </p>
      <button type="button" onClick={close}>Entendido</button>
    </div>
  );
}
