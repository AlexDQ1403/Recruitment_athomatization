'use client';
import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { useInView } from './Reveal';
import { isMotionReduced, useMotionReduced } from '../../lib/motion';
import styles from './landing.module.css';

// Demostraciones animadas de "Una entrada para cada quien": cada escena muestra una cosa que dice el texto

const SCENE_MS = 4600;
const d = (ms: number) => ({ '--d': `${ms}ms` } as CSSProperties);

const reducedMotion = isMotionReduced;

/** Texto que se escribe letra por letra */
function Typed({ text, delay = 0, speed = 38 }: { text: string; delay?: number; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducedMotion()) { setN(text.length); return; }
    let i = 0;
    let iv = 0;
    const start = window.setTimeout(() => {
      iv = window.setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) window.clearInterval(iv);
      }, speed);
    }, delay);
    return () => { window.clearTimeout(start); window.clearInterval(iv); };
  }, [text, delay, speed]);
  return <>{text.slice(0, n)}{n < text.length && <span className={styles.rdCaret} />}</>;
}

/** Número que sube hasta su valor */
function CountUp({ to, delay = 0, decimals = 0, suffix = '' }: { to: number; delay?: number; decimals?: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reducedMotion()) { setV(to); return; }
    let raf = 0;
    const start = window.setTimeout(() => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 900);
        setV(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { window.clearTimeout(start); cancelAnimationFrame(raf); };
  }, [to, delay]);
  return <>{v.toFixed(decimals).replace('.', ',')}{suffix}</>;
}

type Scene = { label: string; node: ReactNode };

/** Pasa por las escenas mientras la tarjeta está a la vista; los puntos permiten saltar a una */
function SceneCycler({ scenes }: { scenes: Scene[] }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const motionReduced = useMotionReduced();
  // Al volver a la vista, la escena se repite desde el inicio (sin dejar la tarjeta vacía mientras tanto)
  const [play, setPlay] = useState(0);
  useEffect(() => { if (inView) setPlay((x) => x + 1); }, [inView]);

  useEffect(() => {
    if (!inView || paused || motionReduced) return;
    const t = window.setTimeout(() => setI((x) => (x + 1) % scenes.length), SCENE_MS);
    return () => window.clearTimeout(t);
  }, [inView, paused, motionReduced, i, scenes.length]);

  return (
    <div
      ref={ref}
      className={`${styles.mock} ${styles.rdMock}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={styles.rdSteps}>
        {scenes.map((s, k) => (
          <button
            key={s.label}
            type="button"
            className={styles.rdStep}
            data-active={k === i}
            onClick={() => setI(k)}
            aria-label={`Ver: ${s.label}`}
            aria-pressed={k === i}
          >
            <span className={styles.rdStepNum}>{k + 1}</span>
            {k === i && <span className={styles.rdStepLabel}>{s.label}</span>}
          </button>
        ))}
      </div>
      <div className={styles.rdStage} aria-hidden="true">
        {/* key: al cambiar de escena (o volver a la vista) se vuelve a montar y sus animaciones arrancan desde cero */}
        <div key={`${i}-${play}`} className={styles.rdScene}>{scenes[i].node}</div>
      </div>
    </div>
  );
}

// ─── Empresa ───────────────────────────────────────────────────────────────

export function CompanyDemo() {
  return (
    <SceneCycler
      scenes={[
        {
          label: 'Invita a tu equipo',
          node: (
            <>
              <p className={styles.mockTitle}>Invitar reclutador</p>
              <div className={styles.rdField}><small>Nombre</small><span><Typed text="Ana Torres" delay={300} /></span></div>
              <div className={styles.rdField}><small>Correo</small><span><Typed text="ana@cafemontana.co" delay={900} speed={32} /></span></div>
              <span className={`${styles.mockAction} ${styles.rdPress}`} style={d(1900)}>Enviar invitación</span>
              <p className={`${styles.rdToast} ${styles.rdIn}`} style={d(2500)}>✓ Le llegó un correo para crear su contraseña</p>
            </>
          ),
        },
        {
          label: 'Decide quién sigue',
          node: (
            <>
              <p className={styles.mockTitle}>Necesitan tu decisión</p>
              <div className={styles.rdRow}>
                <div className={styles.decisionInfo}>
                  <p>Laura Medina</p>
                  <small>Contador(a) público(a) · 92 % afinidad</small>
                </div>
                <div className={`${styles.decisionBtns} ${styles.rdOut}`} style={d(1700)}>
                  <span className={`${styles.btnOk} ${styles.rdPress}`} style={d(1000)}>Autorizar</span>
                  <span className={styles.btnBad}>Descartar</span>
                </div>
              </div>
              <p className={`${styles.rdIn}`} style={d(1900)}>
                <span className={styles.statusOk}>Autorizada · siguiente fase</span>
              </p>
              <p className={`${styles.rdQuote} ${styles.rdIn}`} style={d(2300)}>«Agendar prueba técnica el martes»</p>
              <small className={`${styles.rdNote} ${styles.rdIn}`} style={d(2700)}>El reclutador ve tu decisión y el motivo</small>
            </>
          ),
        },
        {
          label: 'Mide resultados',
          node: (
            <>
              <p className={styles.mockTitle}>Reporte del mes</p>
              <div className={styles.kpis}>
                <div><b><CountUp to={12} delay={200} /></b><small>Presentados</small></div>
                <div><b><CountUp to={5} delay={350} /></b><small>Autorizados</small></div>
                <div><b><CountUp to={2.5} decimals={1} delay={500} /></b><small>Días en decidir</small></div>
              </div>
              <ul className={styles.rdBars}>
                {[['Contador', 80], ['Analista', 55], ['Auxiliar', 35]].map(([n, w], k) => (
                  <li key={n as string}>
                    <small>{n}</small>
                    <span className={styles.rdBar}><span style={{ ...d(600 + k * 150), '--w': `${w}%` } as CSSProperties} /></span>
                  </li>
                ))}
              </ul>
              <span className={`${styles.mockAction} ${styles.rdPress}`} style={d(2000)}>Exportar CSV</span>
            </>
          ),
        },
      ]}
    />
  );
}

// ─── Reclutador ────────────────────────────────────────────────────────────

export function RecruiterDemo() {
  return (
    <SceneCycler
      scenes={[
        {
          label: 'Busca escribiendo',
          node: (
            <>
              <p className={styles.mockQuery}><Typed text="Contadora con NIIF en Bogotá" delay={200} /></p>
              <p className={`${styles.mockMeta} ${styles.rdIn}`} style={d(1500)}>Encontré 3 perfiles que encajan</p>
              <div className={`${styles.candCard} ${styles.candStatic} ${styles.rdIn}`} style={d(1700)}>
                <div className={styles.candHead}>
                  <div>
                    <p className={styles.candName}>Laura Medina</p>
                    <p className={styles.candTitle}>Contadora pública · NIIF</p>
                  </div>
                  <span className={styles.candTag}>Tu base</span>
                </div>
                <div className={styles.candAffinity}>
                  <span className={styles.affBar}><span className={styles.rdGrow} style={{ ...d(2000), '--w': '92%' } as CSSProperties} /></span>
                  <b><CountUp to={92} delay={2000} suffix=" %" /></b> afinidad
                </div>
              </div>
            </>
          ),
        },
        {
          label: 'Contacta con un clic',
          node: (
            <>
              <div className={styles.candHead}>
                <div>
                  <p className={styles.candName}>Laura Medina</p>
                  <p className={styles.candTitle}>92 % afinidad · Bogotá</p>
                </div>
              </div>
              <div className={styles.candActions}>
                <span className={`${styles.btnOk} ${styles.rdPress}`} style={d(500)}>Contactar</span>
                <span className={styles.linkish}>Ver perfil completo</span>
              </div>
              <div className={`${styles.rdWhats} ${styles.rdIn}`} style={d(1100)}>
                <small>WhatsApp · mensaje listo</small>
                <p><Typed text="Hola Laura, soy María Paula de Café Montaña. Vi tu experiencia con NIIF y tenemos una vacante de contadora en Bogotá. ¿Hablamos?" delay={1300} speed={18} /></p>
              </div>
            </>
          ),
        },
        {
          label: 'Vacantes con IA',
          node: (
            <>
              <p className={styles.mockSub}>Describe la vacante</p>
              <p className={styles.rdTextarea}><Typed text="Contador con NIIF en Bogotá, 3 años, hasta 4 millones" delay={200} speed={30} /></p>
              <p className={`${styles.rdNote} ${styles.rdIn}`} style={d(1900)}>✨ La IA llenó el formulario</p>
              {[['Cargo', 'Contador(a) público(a)'], ['Ciudad', 'Bogotá · Presencial'], ['Experiencia', '3+ años · hasta $4.000.000']].map(([k, v], i) => (
                <div key={k} className={`${styles.rdField} ${styles.rdIn}`} style={d(2100 + i * 220)}><small>{k}</small><span>{v}</span></div>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}

// ─── Candidato ─────────────────────────────────────────────────────────────

export function CandidateDemo() {
  return (
    <SceneCycler
      scenes={[
        {
          label: 'Sube tu HV',
          node: (
            <>
              <div className={styles.mockFile}>
                <span className={styles.mockFileIcon}>PDF</span>
                <div>
                  <p>HV_Laura_Medina.pdf</p>
                  <span className={styles.rdBar}><span style={{ ...d(200), '--w': '100%' } as CSSProperties} /></span>
                </div>
              </div>
              <p className={`${styles.rdNote} ${styles.rdIn}`} style={d(1300)}>✨ La IA leyó tu hoja de vida</p>
              <div className={styles.rdField + ' ' + styles.rdIn} style={d(1500)}><small>Cargo</small><span>Contadora pública</span></div>
              <div className={styles.rdField + ' ' + styles.rdIn} style={d(1700)}><small>Experiencia</small><span>6 años · 2 empleos</span></div>
              <p className={styles.chipRow}>
                {['NIIF', 'SIIGO', 'Excel avanzado', 'Inglés B1'].map((c, i) => (
                  <span key={c} className={`${styles.chipHave} ${styles.rdIn}`} style={d(1900 + i * 150)}>{c}</span>
                ))}
              </p>
            </>
          ),
        },
        {
          label: 'Vacantes para ti',
          node: (
            <>
              <p className={styles.mockSub}>Recomendadas para ti</p>
              {[['Contador(a) público(a)', 85, 'high'], ['Analista contable', 64, 'mid'], ['Auxiliar de bodega', 31, 'low']].map(([t, p, lv], i) => (
                <div key={t as string} className={`${styles.rdRow} ${styles.rdIn}`} style={d(200 + i * 300)}>
                  <p className={styles.candName}>{t}</p>
                  <span className={styles.rdMatch} data-level={lv}><b><CountUp to={p as number} delay={300 + i * 300} suffix=" %" /></b></span>
                </div>
              ))}
              <p className={`${styles.chipRow} ${styles.rdIn}`} style={d(1500)}>
                <span className={styles.chipLabel}>Tienes</span><span className={styles.chipHave}>NIIF</span><span className={styles.chipHave}>Conciliaciones</span>
              </p>
              <p className={`${styles.chipRow} ${styles.rdIn}`} style={d(1700)}>
                <span className={styles.chipLabel}>Te falta</span><span className={styles.chipMiss}>Auditorías internas</span>
              </p>
            </>
          ),
        },
        {
          label: 'Ajusta tu HV',
          node: (
            <>
              <p className={styles.mockSub}>Para «Contador(a) público(a)»</p>
              <p className={`${styles.rdQuote} ${styles.rdIn}`} style={d(200)}>Contadora pública con NIIF y 6 años en pymes</p>
              <p className={`${styles.rdNote} ${styles.rdIn}`} style={d(800)}>Pon esto primero</p>
              <ul className={styles.rdBullets}>
                {['Cierres contables bajo NIIF', 'Declaraciones de IVA y retención'].map((t, i) => (
                  <li key={t} className={styles.rdIn} style={d(1000 + i * 250)}>{t}</li>
                ))}
              </ul>
              <p className={`${styles.rdNote} ${styles.rdIn}`} style={d(1700)}>Lo que piden y no se ve en tu perfil</p>
              <ul className={styles.rdBullets}>
                <li className={styles.rdIn} style={d(1900)}>Auditorías internas: menciónalo en la entrevista</li>
              </ul>
            </>
          ),
        },
        {
          label: 'Sigue tus postulaciones',
          node: (
            <>
              <p className={styles.candName}>Contador(a) público(a)</p>
              <p className={styles.candTitle}>Café Montaña · te postulaste hace 6 días</p>
              <ol className={styles.rdTrack}>
                {['Enviada', 'En revisión', 'Preseleccionada', 'Siguiente fase'].map((s, i) => (
                  <li key={s} className={styles.rdIn} style={d(300 + i * 450)}>{s}</li>
                ))}
              </ol>
              <p className={styles.rdIn} style={d(2200)}><span className={styles.statusOk}>¡La empresa te autorizó para la siguiente fase!</span></p>
            </>
          ),
        },
      ]}
    />
  );
}
