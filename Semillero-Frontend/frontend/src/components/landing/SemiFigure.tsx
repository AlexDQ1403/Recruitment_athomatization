'use client';
import { Ref } from 'react';
import styles from './landing.module.css';

interface Props {
  // refs opcionales para que la física de la mascota mueva brazos y ojos cuadro a cuadro
  armLRef?: Ref<SVGGElement>;
  armRRef?: Ref<SVGGElement>;
  eyesRef?: Ref<SVGGElement>;
}

// Dibujo de Semi, el computador con manos y pies. Los gestos los decide el contenedor
// con data-mood (cara) y data-pose (brazos) sobre un elemento con la clase .mascot o .semiInline.
export function SemiFigure({ armLRef, armRRef, eyesRef }: Props) {
  return (
    <svg viewBox="0 0 120 150" className={styles.pcSvg} aria-hidden="true">
      <ellipse cx="60" cy="140" rx="30" ry="4" className={styles.mascotShadow} />

      {/* Zzz cuando se duerme */}
      <g className={styles.zzz}>
        <text x="98" y="14">z</text>
        <text x="106" y="4">z</text>
        <text x="112" y="-6">Z</text>
      </g>

      <g className={styles.pcFloat}>
        {/* piernas */}
        <g className={styles.legL}>
          <path d="M50 96 L47 124" className={styles.pcLimb} />
          <ellipse cx="44" cy="127" rx="8" ry="4.5" className={styles.pcShoe} />
        </g>
        <g className={styles.legR}>
          <path d="M70 96 L73 124" className={styles.pcLimb} />
          <ellipse cx="76" cy="127" rx="8" ry="4.5" className={styles.pcShoe} />
        </g>

        {/* brazos: el grupo externo lo mueve la física, el interno la pose de la sección */}
        <g ref={armLRef}>
          <g className={styles.armL}>
            <path d="M24 44 Q13 58 12 73" className={styles.pcLimb} />
            <circle cx="12" cy="77" r="6.5" className={styles.pcHand} />
            <path d="M7 74 Q5 70 8 69" className={styles.pcThumb} />
          </g>
        </g>
        <g ref={armRRef}>
          <g className={styles.armR}>
            <path d="M96 44 Q107 58 108 73" className={styles.pcLimb} />
            <circle cx="108" cy="77" r="6.5" className={styles.pcHand} />
            <path d="M113 74 Q115 70 112 69" className={styles.pcThumb} />
          </g>
        </g>

        {/* teclado como cuerpo */}
        <rect x="54" y="68" width="12" height="9" className={styles.pcDark} />
        <rect x="32" y="76" width="56" height="21" rx="6" className={styles.pcBody} />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <rect key={`a${k}`} x={37 + k * 8} y="80.5" width="5.5" height="3.2" rx="1" className={styles.pcKey} />
        ))}
        {[0, 1, 2, 3, 4].map((k) => (
          <rect key={`b${k}`} x={41 + k * 8} y="85.5" width="5.5" height="3.2" rx="1" className={styles.pcKey} />
        ))}
        <rect x="45" y="90.5" width="30" height="3.2" rx="1.2" className={styles.pcKey} />

        {/* monitor */}
        <rect x="22" y="8" width="76" height="60" rx="12" className={styles.pcBody} />
        <rect x="29" y="15" width="62" height="45" rx="7" className={styles.pcScreen} />
        <path d="M33 19 L50 19 L36 40 Z" className={styles.pcGlare} />
        <circle cx="60" cy="11.5" r="1.4" className={styles.pcCam} />
        <circle cx="88" cy="64" r="1.8" className={styles.pcLed} />

        {/* cara */}
        <g className={styles.face}>
          <g ref={eyesRef}>
            <g className={styles.eyesNormal}>
              <rect x="44" y="27" width="8" height="12" rx="3.5" />
              <rect x="68" y="27" width="8" height="12" rx="3.5" />
            </g>
            <g className={styles.eyesWow}>
              <circle cx="48" cy="33" r="6" />
              <circle cx="72" cy="33" r="6" />
              <circle cx="48" cy="33" r="2.3" className={styles.faceFill} />
              <circle cx="72" cy="33" r="2.3" className={styles.faceFill} />
            </g>
          </g>
          <g className={styles.eyesHappy}>
            <path d="M43 36 L48 30 L53 36" />
            <path d="M67 36 L72 30 L77 36" />
          </g>
          <g className={styles.eyesSleep}>
            <path d="M43 34 Q48 38 53 34" />
            <path d="M67 34 Q72 38 77 34" />
          </g>
          <g className={styles.eyesLove}>
            <path d="M48 38 C40 32 44 25 48 29.5 C52 25 56 32 48 38Z" />
            <path d="M72 38 C64 32 68 25 72 29.5 C76 25 80 32 72 38Z" />
          </g>

          <path d="M53 46 Q60 53 67 46" className={styles.mouthSmile} />
          <ellipse cx="60" cy="48.5" rx="3.6" ry="4.4" className={styles.mouthO} />
          <path d="M55 48 L65 48" className={styles.mouthFlat} />

          <circle cx="39" cy="45" r="3.2" className={styles.pcCheek} />
          <circle cx="81" cy="45" r="3.2" className={styles.pcCheek} />

          {/* extras en pantalla según la sección */}
          <g className={styles.scrChat}>
            <circle cx="78" cy="54" r="1.4" />
            <circle cx="82.5" cy="54" r="1.4" />
            <circle cx="87" cy="54" r="1.4" />
          </g>
          <g className={styles.scrPipe}>
            <rect x="33" y="50" width="2.4" height="6" />
            <rect x="37" y="50" width="2.4" height="6" />
            <rect x="41" y="50" width="2.4" height="6" />
          </g>
        </g>
      </g>
    </svg>
  );
}
