'use client';
import { Ref } from 'react';
import styles from './landing.module.css';

interface Props {
  // refs que la física de la mascota usa para mover los ojos; las patas las anima el CSS
  armLRef?: Ref<SVGGElement>;
  armRRef?: Ref<SVGGElement>;
  eyesRef?: Ref<SVGGElement>;
}

// Se mantienen por compatibilidad con la física de Mascot.tsx
export const SHOULDER_L = { x: 40, y: 118 };
export const SHOULDER_R = { x: 40, y: 118 };

// Camello de perfil mirando a la izquierda. Sentado (echado, como un camello de verdad) o de pie.
// Cuerpo: pecho, dos jorobas con su hundimiento, anca y vientre.
const BODY =
  'M34 120 C30 108 34 96 44 90 C46 74 51 58 61 54 C69 51 74 56 74 64 C76 58 82 54 88 56 ' +
  'C96 58 100 66 101 76 C108 84 112 98 110 110 C109 120 104 127 96 128 C80 130.5 58 130.5 44 128 C38 128 35 125 34 120 Z';
// mitad inferior del cuerpo en un tono más oscuro (sin brillos)
const BODY_SHADE =
  'M34 112 C46 116 70 116 110 104 C110 116 104 127 96 128 C80 130.5 58 130.5 44 128 C38 128 35 125 34 120 Z';
// cuello largo que sube del pecho y se curva hasta la cabeza
const NECK = 'M36 104 C29 88 25 70 29 50 L47 44 C45 58 48 72 55 86 Z';
// cabeza redonda con el hocico corto y redondeado
const HEAD =
  'M51 34 C51 26 45 21 37 21 C29 21 24 25 20 29 C15 30 10 33 10 38.5 C10 44 14 47.5 20 47.5 ' +
  'C24 50.5 30 52 36 51 C45 50 51 43 51 34 Z';
const EAR = 'M44 25 C44 18 48 14.5 52 15.5 C55 17.5 53 23 49 27.5 Z';
// pata delantera doblada hacia adelante (sentado)
const FRONT_LEG = 'M50 116 C42 114.5 32 115 25 117.5 C19 119.5 17 125 21 127.5 C24 129 34 129 50 128.5 Z';

// Pata de pie: muslo, rodilla nudosa, caña y pie ancho y acolchado con dos dedos
// (los pies acolchados y las rodillas nudosas son lo que distingue a un camello de un caballo).
// Crece desde debajo del vientre cuando el camello se levanta.
function StandLeg({ x, far, walk }: { x: number; far?: boolean; walk: 'a' | 'b' }) {
  return (
    <g className={`${styles.standLeg} ${walk === 'a' ? styles.walkA : styles.walkB}`}>
      <path
        d={`M${x - 5} 112 L${x - 4} 140 C${x - 6.2} 142 ${x - 6.2} 146.5 ${x - 4} 148.5 L${x - 3.4} 160 L${x + 3.4} 160 L${x + 4} 148.5 C${x + 6.2} 146.5 ${x + 6.2} 142 ${x + 4} 140 L${x + 5} 112 Z`}
        className={far ? styles.camelLegFar : styles.camelLeg}
      />
      <path d={`M${x - 7} 159.5 C${x - 8} 166 ${x + 8} 166 ${x + 7} 159.5 Z`} className={styles.camelFoot} />
      <path d={`M${x} 161.5 L${x} 165`} className={styles.camelLine} />
    </g>
  );
}

// Dibujo de Semi. El contenedor decide los gestos con data-mood (ojo, boca y burbuja de emoción)
// y con data-pose / data-moving si está de pie o sentado (ver .camelStand en el CSS).
export function SemiFigure({ eyesRef }: Props) {
  return (
    <svg viewBox="0 0 120 150" className={styles.pcSvg} aria-hidden="true">
      <ellipse cx="65" cy="127" rx="38" ry="3.2" className={styles.mascotShadow} />

      {/* todo el camello al 75 %, para que quepa también de pie (con la burbuja) */}
      <g transform="translate(16 28) scale(0.75)">
        <g className={styles.camelStand}>
          <g className={styles.pcFloat}>
            {/* patas de pie: las del fondo primero, más oscuras */}
            <StandLeg x={92} far walk="b" />
            <StandLeg x={44} far walk="a" />
            <StandLeg x={100} walk="a" />
            <StandLeg x={52} walk="b" />

            {/* cola con mechón */}
            <g className={styles.camelTailGroup}>
              <path d="M108 100 C115 104 117 112 114 119" className={styles.camelTail} />
              <path d="M114 115 C119 117 119 125 113.5 126.5 C110 125 110 118 114 115 Z" className={styles.camelTuft} />
            </g>

            {/* pata delantera doblada (solo sentado), metida bajo el pecho */}
            <g className={styles.sitPart}>
              <path d={FRONT_LEG} className={styles.camelLeg} />
              <path d="M23.5 118.6 C19 120.5 17.6 125 21 127.5 C22.4 128.3 24 128.7 26 128.8 C23.2 126 22.6 121.8 23.5 118.6 Z" className={styles.camelHoof} />
            </g>

            {/* cuello y cuerpo: primero el contorno de ambos, luego el relleno → una sola silueta */}
            <path d={NECK} className={styles.camelOutline} />
            <path d={BODY} className={styles.camelOutline} />
            <path d={NECK} className={styles.camelFur} />
            <path d={BODY} className={styles.camelFur} />
            <path d={BODY_SHADE} className={styles.camelShade} />
            {/* contorno del anca y pezuña trasera: solo sentado */}
            <g className={styles.sitPart}>
              <path d="M80 127 C78 113 88 103 101 105" className={styles.camelLine} />
              <path d="M96 128 C99 124 105 123.5 107 126 C108 128 106 129.5 103 129.5 L96 129.5 Z" className={styles.camelHoof} />
            </g>

            {/* cabeza: se inclina según la sección */}
            <g className={styles.camelHead}>
              <path d={EAR} className={styles.camelOutline} />
              <path d={HEAD} className={styles.camelOutline} />
              <path d={EAR} className={styles.camelFur} />
              <path d="M46 24 C46.2 19.5 48.4 17.5 50.8 18 C52 19.6 50.8 22.6 48.3 25.4 Z" className={styles.camelEarInner} />
              <path d={HEAD} className={styles.camelFur} />
              {/* fosa nasal */}
              <path d="M13.2 36.2 Q14.8 35 16.4 36.4" className={styles.camelLine} />

              <g className={styles.face}>
                <g ref={eyesRef}>
                  <g className={styles.eyesNormal}>
                    <ellipse cx="33" cy="32.5" rx="2.7" ry="3.5" />
                    <circle cx="34" cy="31.2" r="1.05" className={styles.eyeShine} />
                  </g>
                  <g className={styles.eyesWow}>
                    <circle cx="33" cy="32.5" r="4" className={styles.eyeWhite} />
                    <circle cx="32.6" cy="32.8" r="2" />
                  </g>
                </g>
                <path d="M29.5 33.5 Q33 29.5 36.5 33.5" className={styles.eyesHappy} />
                <path d="M29.5 32 Q33 35.5 36.5 32" className={styles.eyesSleep} />
                <path d="M33 36.5 C29 33.5 29.8 29.3 32 29.7 C32.6 29.8 33 30.3 33 30.8 C33 30.3 33.4 29.8 34 29.7 C36.2 29.3 37 33.5 33 36.5 Z" className={styles.eyesLove} />

                {/* boca: sonrisa suave en el hocico */}
                <path d="M14.5 43.5 Q19.5 47 25.5 44.3" className={styles.mouthSmile} />
                <ellipse cx="17" cy="44.4" rx="1.6" ry="1.9" className={styles.mouthO} />
                <path d="M15 44.2 Q19.5 45.2 24.5 44.4" className={styles.mouthFlat} />
              </g>
            </g>
          </g>

          {/* burbuja de emoción junto a la cabeza (sube y baja con ella) */}
          <g className={styles.exprBubble}>
            <g transform="translate(9 3)">
              <path d="M45 21 L47 15 L51 19 Z" className={styles.bubbleShape} />
              <circle cx="54" cy="10" r="10" className={styles.bubbleShape} />
              {/* relleno de la colita encima, para tapar el borde del círculo donde se unen */}
              <path d="M45 21 L47 15 L51 19 Z" className={styles.bubbleFill} />

              <path
                d="M54 15 C48.5 11 49 6 52 6 C53.2 6 54 7 54 8 C54 7 54.8 6 56 6 C59 6 59.5 11 54 15 Z"
                className={styles.exprLove}
              />
              <g className={styles.exprHappy}>
                <path d="M52.5 13 L52.5 5 L58 3.8 L58 11.6" />
                <ellipse cx="51" cy="13.4" rx="2.2" ry="1.7" />
                <ellipse cx="56.5" cy="12" rx="2.2" ry="1.7" />
              </g>
              <g className={styles.exprWow}>
                <rect x="52.6" y="3.5" width="2.8" height="8.5" rx="1.4" />
                <circle cx="54" cy="15" r="1.6" />
              </g>
              <path d="M54 4 C56.5 8 58 10.5 58 12.3 C58 14.6 56.2 16 54 16 C51.8 16 50 14.6 50 12.3 C50 10.5 51.5 8 54 4 Z" className={styles.exprShy} />
              <g className={styles.zzz}>
                <text x="48.5" y="15">z</text>
                <text x="54" y="10">Z</text>
              </g>
              <g className={styles.scrChat}>
                <circle cx="49.5" cy="10" r="1.6" />
                <circle cx="54" cy="10" r="1.6" />
                <circle cx="58.5" cy="10" r="1.6" />
              </g>
              <g className={styles.scrPipe}>
                <rect x="49.4" y="5" width="2.6" height="10" />
                <rect x="52.7" y="5" width="2.6" height="10" />
                <rect x="56" y="5" width="2.6" height="10" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
