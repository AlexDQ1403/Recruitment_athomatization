'use client';
import { CSSProperties, useEffect, useState } from 'react';
import { useInView } from './Reveal';
import styles from './landing.module.css';
import { useMotionReduced } from '../../lib/motion';

// Ejemplos de lo que se le puede pedir al chat; las tarjetas imitan el resultado real de la app
type DemoCandidate = { name: string; title: string; meta: string; affinity: number; external?: boolean };
const EXAMPLES: { query: string; candidates: DemoCandidate[] }[] = [
  {
    query: '“Desarrolladora backend en Bogotá, con tres años de Node y experiencia en PostgreSQL”',
    candidates: [
      { name: 'Laura Gómez', title: 'Desarrolladora Backend · Node.js', meta: 'Bogotá · 4 años', affinity: 91 },
      { name: 'Andrés Rincón', title: 'Backend Developer · PostgreSQL', meta: 'Bogotá · 3 años', affinity: 78, external: true },
    ],
  },
  {
    query: '“Diseñador UX/UI con portafolio, inglés avanzado y disponibilidad para trabajo remoto”',
    candidates: [
      { name: 'Sebastián Mejía', title: 'Diseñador UX/UI · Figma', meta: 'Remoto · 5 años', affinity: 87 },
      { name: 'Camila Duarte', title: 'Product Designer', meta: 'Medellín · 3 años', affinity: 72, external: true },
    ],
  },
  {
    query: '“Analista de datos junior que sepa Python y Power BI, en Medellín”',
    candidates: [
      { name: 'Valentina Ríos', title: 'Analista de datos · Python', meta: 'Medellín · 1 año', affinity: 89 },
      { name: 'Julián Osorio', title: 'Analista BI · Power BI', meta: 'Envigado · 2 años', affinity: 74 },
    ],
  },
  {
    query: '“Contadora con experiencia en NIIF y aspiración salarial hasta 4 millones”',
    candidates: [
      { name: 'Laura Medina', title: 'Contadora pública · NIIF', meta: 'Bogotá · 6 años', affinity: 92 },
      { name: 'Karen Morales', title: 'Analista contable', meta: 'Bogotá · 4 años', affinity: 70, external: true },
    ],
  },
];

const LONGEST = EXAMPLES.reduce((a, b) => (b.query.length > a.length ? b.query : a), '');

type Phase = 'idle' | 'typing' | 'searching' | 'done' | 'erasing';

export function ChatDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const motionReduced = useMotionReduced();
  const query = EXAMPLES[index].query;

  // Arranca al entrar en pantalla y se reinicia al salir
  useEffect(() => {
    if (inView) {
      setPhase((p) => (p === 'idle' ? 'typing' : p));
    } else {
      setPhase('idle');
      setTyped(0);
    }
  }, [inView]);

  useEffect(() => {
    const reduce = motionReduced;
    let interval = 0;
    let timeout = 0;

    if (phase === 'typing') {
      if (reduce) {
        setTyped(query.length);
        setPhase('done');
      } else {
        interval = window.setInterval(() => {
          setTyped((n) => Math.min(n + 1, query.length));
        }, 34);
      }
    } else if (phase === 'searching') {
      timeout = window.setTimeout(() => setPhase('done'), 1300);
    } else if (phase === 'done') {
      // tiempo de lectura antes de pasar al siguiente ejemplo
      timeout = window.setTimeout(() => setPhase('erasing'), reduce ? 6000 : 4200);
    } else if (phase === 'erasing') {
      if (reduce) {
        setTyped(0);
        setIndex((i) => (i + 1) % EXAMPLES.length);
        setPhase('typing');
      } else {
        interval = window.setInterval(() => {
          setTyped((n) => Math.max(n - 3, 0));
        }, 16);
      }
    }

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [phase, query.length, motionReduced]);

  // Transiciones al terminar de escribir o de borrar
  useEffect(() => {
    if (phase === 'typing' && typed >= query.length) {
      const t = window.setTimeout(() => setPhase('searching'), 350);
      return () => window.clearTimeout(t);
    }
    if (phase === 'erasing' && typed === 0) {
      const t = window.setTimeout(() => {
        setIndex((i) => (i + 1) % EXAMPLES.length);
        setPhase('typing');
      }, 250);
      return () => window.clearTimeout(t);
    }
  }, [phase, typed, query.length]);

  return (
    <div ref={ref} className={styles.chatDemo} aria-hidden="true">
      <div className={styles.chatHeader}>
        <span className={styles.chatHint}>Prueba a preguntar</span>
        <span className={styles.chatDots}>
          {EXAMPLES.map((_, i) => (
            <span key={i} data-active={i === index} />
          ))}
        </span>
      </div>

      <p className={styles.chatQuery}>
        {/* texto invisible del ejemplo más largo: reserva el alto y evita saltos */}
        <span className={styles.chatSizer}>{LONGEST}</span>
        <span className={styles.chatTyped}>
          {query.slice(0, typed)}
          {phase !== 'done' && phase !== 'searching' && <span className={styles.caret} />}
        </span>
      </p>

      <div className={styles.chatStatus} data-show={phase === 'searching'}>
        <div className={styles.chatStatusInner}>
        <span className={styles.searchDots}>
          <span />
          <span />
          <span />
        </span>
        Buscando en tu base y en LinkedIn
        </div>
      </div>

      <ul className={styles.chatResults} data-in={phase === 'done'}>
        {EXAMPLES[index].candidates.map((c, i) => (
          <li key={c.name} className={styles.candCard} style={{ '--i': i } as CSSProperties}>
            <div className={styles.candHead}>
              <div>
                <p className={styles.candName}>{c.name}</p>
                <p className={styles.candTitle}>{c.title}</p>
              </div>
              <span className={styles.candTag}>{c.external ? 'Búsqueda externa' : 'Tu base'}</span>
            </div>
            <div className={styles.candAffinity}>
              <span className={styles.affBar}><span style={{ width: `${c.affinity}%` }} /></span>
              <b>{c.affinity} %</b> afinidad
              <span className={styles.candMeta}>{c.meta}</span>
            </div>
            <div className={styles.candActions}>
              <span className={styles.btnOk}>Contactar</span>
              <span className={styles.linkish}>Ver perfil completo</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
