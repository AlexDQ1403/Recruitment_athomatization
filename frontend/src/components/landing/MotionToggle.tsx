'use client';
import { setMotionPaused, useMotionPausedByUser } from '../../lib/motion';
import styles from './landing.module.css';

/** Botón para quien se marea o se distrae con el movimiento: pausa todas las animaciones */
export function MotionToggle({ className }: { className?: string }) {
  const paused = useMotionPausedByUser();
  const label = paused ? 'Reanudar animaciones' : 'Pausar animaciones';
  return (
    <button
      type="button"
      onClick={() => setMotionPaused(!paused)}
      className={className ?? styles.themeToggle}
      aria-label={label}
      aria-pressed={paused}
      title={label}
    >
      {paused ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 5v14M15 5v14" /></svg>
      )}
    </button>
  );
}
