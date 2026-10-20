'use client';
import { CSSProperties, useEffect, useState } from 'react';
import { useInView } from './Reveal';
import styles from './landing.module.css';

const PIPELINE = [
  { label: 'En contacto', note: 'Primer acercamiento con el candidato' },
  { label: 'Seguimiento', note: 'Entrevistas y evaluación en curso' },
  { label: 'Rechazado', note: 'Cierra el ciclo con trazabilidad' },
];

// Las etapas aparecen en cascada y luego se ilumina una a la vez, como un candidato avanzando
export function PipelineStages() {
  const { ref, inView } = useInView<HTMLOListElement>(0.3);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!inView) {
      setActive(-1);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = 0;
    const start = window.setTimeout(() => setActive(0), 900);
    const id = window.setInterval(() => {
      i = (i + 1) % PIPELINE.length;
      setActive(i);
    }, 2000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [inView]);

  return (
    <ol ref={ref} className={styles.stages} data-in={inView} data-cycling={active >= 0}>
      {PIPELINE.map((stage, i) => (
        <li
          key={stage.label}
          className={styles.stage}
          data-active={active === i}
          style={{ '--i': i } as CSSProperties}
        >
          <span className={styles.stageIndex}>
            <span className={styles.stageDot} />0{i + 1}
          </span>
          <span className={styles.stageLabel}>{stage.label}</span>
          <span className={styles.stageNote}>{stage.note}</span>
        </li>
      ))}
    </ol>
  );
}
