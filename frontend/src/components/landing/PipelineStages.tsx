'use client';
import { CSSProperties, useEffect, useState } from 'react';
import { useInView } from './Reveal';
import styles from './landing.module.css';
import { useMotionReduced } from '../../lib/motion';

const PIPELINE = [
  { label: 'Contactado', note: 'Primer mensaje por WhatsApp, correo o LinkedIn' },
  { label: 'Presentado', note: 'El reclutador lo aprueba para la vacante' },
  { label: 'Siguiente fase', note: 'La empresa lo autoriza para entrevistas o pruebas' },
];

// Las etapas aparecen en cascada y luego se ilumina una a la vez, como un candidato avanzando
export function PipelineStages() {
  const { ref, inView } = useInView<HTMLOListElement>(0.3);
  const [active, setActive] = useState(-1);
  const motionReduced = useMotionReduced();

  useEffect(() => {
    if (!inView) {
      setActive(-1);
      return;
    }
    if (motionReduced) return;
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
  }, [inView, motionReduced]);

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
