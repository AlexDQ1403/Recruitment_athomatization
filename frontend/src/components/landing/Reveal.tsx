'use client';
import { CSSProperties, Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import styles from './landing.module.css';

interface Props {
  children: ReactNode;
  /** Retraso de la animación en milisegundos */
  delay?: number;
  /** "fade" sube y aparece; "words" revela palabra por palabra (usar con <SplitWords>) */
  variant?: 'fade' | 'words';
  className?: string;
}

// Hook compartido: indica si el elemento está en pantalla (se reinicia al salir para repetir la animación)
export function useInView<T extends Element>(threshold = 0.2, once = false) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) io.disconnect();
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  return { ref, inView };
}

export function Reveal({ children, delay = 0, variant = 'fade', className }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const base = variant === 'words' ? styles.revealWords : styles.reveal;
  return (
    <div
      ref={ref}
      data-in={inView}
      className={className ? `${base} ${className}` : base}
      style={{ '--d': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

// Divide un texto en palabras enmascaradas para animarlas en cascada
export function SplitWords({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <Fragment key={i}>
          <span className={styles.w}>
            <span style={{ '--i': i } as CSSProperties}>{word}</span>
          </span>{' '}
        </Fragment>
      ))}
    </>
  );
}
