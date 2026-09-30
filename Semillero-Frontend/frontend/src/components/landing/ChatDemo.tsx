'use client';
import { CSSProperties, useEffect, useState } from 'react';
import { useInView } from './Reveal';
import styles from './landing.module.css';

// Ejemplos de lo que se le puede pedir al chat; rotan mientras la persona lee
const EXAMPLES = [
  {
    query: '“Desarrolladora backend en Bogotá, con tres años de Node y experiencia en PostgreSQL”',
    results: ['Perfiles con 3 años o más en Node.js', 'Candidatos ubicados en Bogotá', 'PostgreSQL resaltado entre sus skills'],
  },
  {
    query: '“Diseñador UX/UI con portafolio, inglés avanzado y disponibilidad para trabajo remoto”',
    results: ['Portafolio enlazado en el perfil', 'Inglés avanzado mencionado en la hoja de vida', 'Disponibles para modalidad remota'],
  },
  {
    query: '“Analista de datos junior que sepa Python y Power BI, en Medellín”',
    results: ['Perfiles junior o recién egresados', 'Python y Power BI entre sus skills', 'Candidatos ubicados en Medellín'],
  },
  {
    query: '“Contadora con experiencia en NIIF y aspiración salarial hasta 4 millones”',
    results: ['Experiencia en NIIF en su trayectoria', 'Aspiración salarial dentro del rango', 'Ordenados por coincidencia con el perfil'],
  },
];

const LONGEST = EXAMPLES.reduce((a, b) => (b.query.length > a.length ? b.query : a), '');

type Phase = 'idle' | 'typing' | 'searching' | 'done' | 'erasing';

export function ChatDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  }, [phase, query.length]);

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
        <span className={styles.searchDots}>
          <span />
          <span />
          <span />
        </span>
        Buscando en tu base de candidatos
      </div>

      <ul className={styles.chatResults} data-in={phase === 'done'}>
        {EXAMPLES[index].results.map((r, i) => (
          <li key={r} style={{ '--i': i } as CSSProperties}>
            <span className={styles.dot} />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}
