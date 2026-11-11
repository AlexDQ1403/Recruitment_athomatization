'use client';
import { useEffect, useState } from 'react';

/**
 * Pausa de animaciones: la persona puede detenerlas con un botón (además de la
 * preferencia "reducir movimiento" del sistema). Se guarda en el navegador y se
 * marca en <html data-motion="paused"> para que el CSS también las detenga.
 */

const STORAGE_KEY = 'kmella-motion-paused';
const EVENT = 'kmella-motion-change';

const systemReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function isMotionPausedByUser(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** true si no debe haber movimiento: lo pidió la persona o su sistema */
export const isMotionReduced = () => systemReduced() || isMotionPausedByUser();

function applyAttribute(paused: boolean) {
  if (typeof document === 'undefined') return;
  if (paused) document.documentElement.setAttribute('data-motion', 'paused');
  else document.documentElement.removeAttribute('data-motion');
}

export function setMotionPaused(paused: boolean) {
  try {
    if (paused) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin almacenamiento: la pausa dura mientras la página esté abierta */
  }
  applyAttribute(paused);
  window.dispatchEvent(new Event(EVENT));
}

/** Si el movimiento está reducido; se actualiza al usar el botón o cambiar la preferencia del sistema */
export function useMotionReduced(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const update = () => {
      applyAttribute(isMotionPausedByUser());
      setReduced(isMotionReduced());
    };
    update();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', update);
    window.addEventListener(EVENT, update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return reduced;
}

/** Solo la elección de la persona (para el estado del botón) */
export function useMotionPausedByUser(): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const update = () => setPaused(isMotionPausedByUser());
    update();
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return paused;
}
