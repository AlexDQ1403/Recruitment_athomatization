'use client';
import { CSSProperties } from 'react';
import { useInView } from './Reveal';
import styles from './landing.module.css';

// Personas que el brote conecta: posición del nodo y punto de la planta del que sale su línea
const PEOPLE = [
  { x: 72, y: 70, from: [150, 142] },
  { x: 330, y: 58, from: [252, 92] },
  { x: 40, y: 200, from: [150, 142] },
  { x: 362, y: 180, from: [252, 92] },
  { x: 92, y: 300, from: [200, 250] },
  { x: 312, y: 296, from: [200, 250] },
];

// Ilustración del cierre: una semilla que brota y va conectando personas
export function Sprout() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);

  return (
    <div ref={ref} className={styles.sprout} data-in={inView} aria-hidden="true">
      <svg viewBox="0 0 400 360" className={styles.sproutSvg}>
        <ellipse cx="200" cy="322" rx="130" ry="10" className={styles.sproutGround} />

        {/* líneas hacia las personas */}
        {PEOPLE.map((p, i) => (
          <line
            key={`l${i}`}
            x1={p.from[0]}
            y1={p.from[1]}
            x2={p.x}
            y2={p.y}
            pathLength={1}
            className={styles.sproutLink}
            style={{ '--i': i } as CSSProperties}
          />
        ))}

        {/* tallo y hojas */}
        <path
          d="M200 322 C200 280 188 240 200 196 S214 120 200 72"
          pathLength={1}
          className={styles.sproutStem}
        />
        <path d="M198 206 C162 196 142 166 150 142 C176 148 196 174 198 206Z" className={`${styles.sproutLeaf} ${styles.leafBlue}`} />
        <path d="M202 152 C238 142 258 114 252 92 C226 98 206 122 202 152Z" className={`${styles.sproutLeaf} ${styles.sproutLeaf2} ${styles.leafRed}`} />
        <circle cx="200" cy="66" r="9" className={styles.sproutBud} />

        {/* personas */}
        {PEOPLE.map((p, i) => (
          <g
            key={`p${i}`}
            className={styles.sproutPerson}
            style={{ '--i': i, transformOrigin: `${p.x}px ${p.y}px` } as CSSProperties}
          >
            <circle cx={p.x} cy={p.y} r="20" className={styles.sproutNode} />
            <circle cx={p.x} cy={p.y - 5} r="5" className={styles.sproutGlyph} />
            <path d={`M${p.x - 9} ${p.y + 11} a9 8 0 0 1 18 0`} className={styles.sproutGlyph} />
          </g>
        ))}
      </svg>
    </div>
  );
}
