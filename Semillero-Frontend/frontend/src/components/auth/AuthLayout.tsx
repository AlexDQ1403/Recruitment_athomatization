'use client';
import Link from 'next/link';
import { CSSProperties, InputHTMLAttributes, ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import { Logo } from '../landing/Logo';
import { Reveal, SplitWords } from '../landing/Reveal';
import { SemiFigure } from '../landing/SemiFigure';
import { ThemeToggle } from '../landing/ThemeToggle';
import landing from '../landing/landing.module.css';
import styles from './auth.module.css';

// Posiciones fijas (sin azar en render) de los triángulos que flotan alrededor de Semi
const SPARKS = [
  { x: '12%', y: '38%', c: '#c81b1d', s: '14px', t: '7s', d: '0s' },
  { x: '84%', y: '30%', c: '#3d5ba8', s: '18px', t: '9s', d: '-2s' },
  { x: '20%', y: '72%', c: '#3d5ba8', s: '10px', t: '8s', d: '-4s' },
  { x: '78%', y: '66%', c: '#c81b1d', s: '12px', t: '6.5s', d: '-1s' },
  { x: '6%', y: '58%', c: '#a9bde6', s: '8px', t: '10s', d: '-3s' },
  { x: '92%', y: '50%', c: '#a9bde6', s: '9px', t: '7.5s', d: '-5s' },
];

export interface SemiState {
  pose: string;
  mood: string;
  say: string;
}

/**
 * Consejos por inactividad: tras `idleAfter` ms sin teclear, hacer clic o enfocar,
 * devuelve el índice del consejo a mostrar (va rotando). -1 mientras no aplica.
 */
export function useIdleTips(enabled: boolean, idleAfter = 4000, every = 6500) {
  const [tip, setTip] = useState(-1);
  const [lastActivity, setLastActivity] = useState(0);

  useEffect(() => {
    const bump = () => setLastActivity(Date.now());
    const events = ['keydown', 'pointerdown', 'focusin'] as const;
    events.forEach((ev) => window.addEventListener(ev, bump));
    return () => events.forEach((ev) => window.removeEventListener(ev, bump));
  }, []);

  useEffect(() => {
    setTip(-1);
    if (!enabled) return;
    let interval = 0;
    const start = window.setTimeout(() => {
      setTip(0);
      interval = window.setInterval(() => setTip((t) => t + 1), every);
    }, idleAfter);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [enabled, idleAfter, every, lastActivity]);

  return tip;
}

/**
 * Ojos de Semi: si hay un texto en edición, lo siguen según su largo;
 * si no, miran hacia el cursor.
 */
export function useSemiEyes(
  eyesRef: RefObject<SVGGElement>,
  semiRef: RefObject<HTMLDivElement>,
  typing: string | null,
) {
  useEffect(() => {
    const eyes = eyesRef.current;
    if (!eyes) return;
    if (typing !== null) {
      const x = Math.max(-3, Math.min(3, -3 + typing.length * 0.22));
      eyes.setAttribute('transform', `translate(${x.toFixed(2)} 2.5)`);
      return;
    }
    eyes.setAttribute('transform', 'translate(0 0)');
    const onMove = (e: PointerEvent) => {
      const box = semiRef.current?.getBoundingClientRect();
      if (!box) return;
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height * 0.3);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(d / 200, 1) * 3;
      eyes.setAttribute('transform', `translate(${((dx / d) * k).toFixed(2)} ${((dy / d) * k).toFixed(2)})`);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [eyesRef, semiRef, typing]);
}

interface LayoutProps {
  label: string;
  heading: string;
  semi: SemiState;
  /** Semi se sacude (p. ej. ante un error) */
  shake?: boolean;
  eyesRef: RefObject<SVGGElement>;
  semiRef: RefObject<HTMLDivElement>;
  /** contenido extra bajo Semi (p. ej. confeti) */
  children: ReactNode;
}

// Estructura común de las páginas de acceso: barra superior, Semi protagonista y la tarjeta
export function AuthLayout({ label, heading, semi, shake, eyesRef, semiRef, children }: LayoutProps) {
  return (
    <div className={`${landing.page} ${styles.authPage}`}>
      <header className={`${styles.topBar} ${landing.navEnter}`}>
        <Logo id="semillero-mark-auth" />
        <div className={styles.topActions}>
          <Link href="/" className={styles.backLink}>
            <span aria-hidden="true">←</span> Volver al inicio
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.layout}>
        {/* Semi es el protagonista: grande, hablando y reaccionando a lo que pasa */}
        <section className={styles.brandSide}>
          <div className={styles.brandText}>
            <Reveal delay={100}>
              <p className={landing.label}>{label}</p>
            </Reveal>
            <Reveal variant="words" delay={200}>
              <h1 className={styles.brandHeading}>
                <SplitWords text={heading} />
              </h1>
            </Reveal>
          </div>

          <div className={styles.semiStage}>
            {/* triangulitos de la marca flotando alrededor de Semi */}
            <div className={styles.sparks} aria-hidden="true">
              {SPARKS.map((sp, i) => (
                <span
                  key={i}
                  style={{ left: sp.x, top: sp.y, '--c': sp.c, '--s': sp.s, '--t': sp.t, '--dl': sp.d } as CSSProperties}
                />
              ))}
            </div>
            <p key={semi.say} className={styles.semiSay} role="status" aria-live="polite">
              {semi.say}
            </p>
            <div
              ref={semiRef}
              className={`${landing.mascot} ${styles.semiInline}`}
              data-pose={semi.pose}
              data-mood={semi.mood}
              aria-hidden="true"
            >
              <span key={`${semi.pose}-${semi.mood}`} className={shake ? styles.semiShake : landing.pcHop}>
                <SemiFigure eyesRef={eyesRef} />
              </span>
            </div>
          </div>
        </section>

        <section className={styles.formSide}>
          <div className={styles.cardWrap}>{children}</div>
        </section>
      </main>
    </div>
  );
}

type PasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  show: boolean;
  onToggle: () => void;
};

// Campo de contraseña con botón para mostrarla u ocultarla
export function PasswordInput({ show, onToggle, ...props }: PasswordProps) {
  return (
    <div className={styles.passwordWrap}>
      <input {...props} type={show ? 'text' : 'password'} />
      <button
        type="button"
        className={styles.eyeButton}
        // evita que el input pierda el foco al pulsar el botón
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={show}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function useSemiRefs() {
  return { eyesRef: useRef<SVGGElement>(null), semiRef: useRef<HTMLDivElement>(null) };
}
