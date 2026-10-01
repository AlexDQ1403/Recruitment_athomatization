'use client';
import Link from 'next/link';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { SemiFigure } from './SemiFigure';
import styles from './landing.module.css';

// Lo que dice Semi en cada sección; mientras la persona se queda, va rotando los mensajes
type Message = { text: string; cta?: { href: string; label: string } };
const MESSAGES: Record<string, Message[]> = {
  inicio: [
    { text: '¡Hola! Soy Semi, tu camello reclutador. Baja conmigo y te muestro todo.' },
    { text: 'Esa constelación de ahí son candidatos conectados. ¡Mira cómo cambia de forma!' },
    { text: 'Tip: puedes cambiar a modo claro u oscuro con el botón de arriba.' },
  ],
  chat: [
    { text: 'Mira cómo tecleo: así le pides candidatos a la IA.' },
    { text: 'Escribe como le hablarías a un colega. Yo entiendo ciudad, años de experiencia y skills.' },
    { text: 'Quédate un momento y verás más ejemplos de qué preguntar.' },
  ],
  pipeline: [
    { text: '¡Un, dos, un, dos! Así avanza cada candidato por las etapas.' },
    { text: 'Puedes mover candidatos en la tabla o en el tablero kanban, como prefieras.' },
    { text: 'Cada cambio de estado queda en el historial. ¡Nada se pierde!' },
  ],
  roles: [
    { text: '¿Empresa o candidato? Tú eliges el camino, yo te acompaño.' },
    { text: 'Las empresas pueden invitar a su equipo de reclutadores.' },
    { text: 'Si buscas empleo, sube tu hoja de vida y te muestro las vacantes que más te encajan.' },
  ],
  empezar: [
    { text: '¡Me encantaría trabajar contigo! Crea tu cuenta y empezamos.', cta: { href: '/register', label: 'Crear cuenta →' } },
    { text: 'Solo toma un par de minutos. ¡Yo te espero aquí!', cta: { href: '/register', label: 'Crear cuenta →' } },
  ],
};
const ROTATE_EVERY = 7000;
const SECTION_IDS = Object.keys(MESSAGES);
const BASE_MOOD: Record<string, string> = {
  inicio: 'happy',
  chat: 'normal',
  pipeline: 'normal',
  roles: 'normal',
  empezar: 'love',
};

// Confeti de triángulos para la celebración final (posiciones fijas, sin azar en render)
const CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const d = 70 + (i % 3) * 22;
  return {
    dx: Math.cos(a) * d,
    dy: Math.sin(a) * d - 30,
    r: (i * 67) % 360,
    c: ['#c81b1d', '#3d5ba8', '#112454', '#e5484d', '#a9bde6'][i % 5],
  };
});

const SLEEP_AFTER = 9000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function Mascot() {
  const [section, setSection] = useState('inicio');
  // open: Semi quiere hablar (el usuario puede cerrarlo); covered: el globo quedaría encima de un texto
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(true);
  const [covered, setCovered] = useState(false);
  const [anim, setAnim] = useState<{ key: number; kind: 'hop' | 'spin' }>({ key: 0, kind: 'hop' });

  const rootRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const sectionRef = useRef('inicio');
  const wakeRef = useRef<() => void>(() => {});
  const bubbleRef = useRef<HTMLDivElement>(null);
  const coveredRef = useRef(false);
  const [msgIndex, setMsgIndex] = useState(0);

  // Saludo inicial
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 1400);
    return () => window.clearTimeout(t);
  }, []);

  // Sección en el centro de la pantalla
  useEffect(() => {
    const els = SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setSection(hit.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    sectionRef.current = section;
    setAnim((a) => ({ key: a.key + 1, kind: 'hop' }));
    // sección nueva: Semi vuelve a hablar (aunque antes lo hayan cerrado) desde el primer mensaje
    setOpen(true);
    setMsgIndex(0);
  }, [section]);

  // Sigue conversando: cambia de mensaje cada tanto, solo mientras el globo se ve
  useEffect(() => {
    if (!ready || !open || covered) return;
    const t = window.setTimeout(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES[section].length);
    }, ROTATE_EVERY);
    return () => window.clearTimeout(t);
  }, [ready, open, covered, section, msgIndex]);

  wakeRef.current = () => setAnim((a) => ({ key: a.key + 1, kind: 'hop' }));

  // Física: sigue el scroll con un resorte, se inclina, balancea los brazos y camina
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let y = window.innerHeight - 220;
    let vel = 0;
    let lastScroll = window.scrollY;
    let scrollVel = 0;
    let lastActivity = performance.now();
    let sleeping = false;
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;
    // mientras duerme y está quieto, el bucle se pausa; cualquier actividad lo reanuda
    let paused = false;
    // la sorpresa por scroll rápido se mantiene un momento para que la burbuja no parpadee
    let wowUntil = 0;

    const onActivity = () => {
      lastActivity = performance.now();
      if (sleeping) {
        sleeping = false;
        wakeRef.current();
      }
      if (paused) {
        paused = false;
        raf = requestAnimationFrame(tick);
      }
    };
    const onScroll = () => onActivity();

    // ¿El globo cae encima de algún texto de la página? Se mide sobre las líneas reales del texto.
    // Las líneas se guardan en coordenadas de documento y solo se vuelven a medir al cambiar el
    // tamaño de la ventana o cada 1,5 s (por las animaciones de entrada), no en cada comprobación.
    const range = document.createRange();
    const PAD = 8;
    type Box = { left: number; right: number; top: number; bottom: number };
    let lines: Box[] = [];
    let measuredAt = -Infinity;
    const measureLines = () => {
      const sy = window.scrollY;
      const next: Box[] = [];
      for (const el of Array.from(document.querySelectorAll('main h1, main h2, main h3, main p, main li, main a'))) {
        range.selectNodeContents(el);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width) next.push({ left: r.left, right: r.right, top: r.top + sy, bottom: r.bottom + sy });
        }
      }
      lines = next;
      measuredAt = performance.now();
    };
    const onResize = () => { measuredAt = -Infinity; };
    window.addEventListener('resize', onResize);
    const overlapsText = (box: DOMRect) => {
      if (performance.now() - measuredAt > 1500) measureLines();
      const sy = window.scrollY;
      const top = box.top + sy - PAD;
      const bottom = box.bottom + sy + PAD;
      return lines.some(
        (l) => box.left - PAD < l.right && box.right + PAD > l.left && top < l.bottom && bottom > l.top,
      );
    };
    let lastCheck = 0;
    let clearSince = 0;
    const onPointer = (e: PointerEvent) => {
      onActivity();
      const r = root.getBoundingClientRect();
      const dx = e.clientX - (r.right - 68);
      const dy = e.clientY - (r.top + 55);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(d / 160, 1) * 3;
      look.tx = (dx / d) * k;
      look.ty = (dy / d) * k;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer);

    const tick = () => {
      const vh = window.innerHeight;
      const h = root.offsetHeight;
      const mobile = window.innerWidth < 960;
      const max = document.documentElement.scrollHeight - vh;
      const progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      const top = 96 + 140; // deja lugar para el globo encima
      const bottom = vh - h - 20;
      const target = mobile || reduce ? bottom : top + progress * (bottom - top);

      if (reduce) {
        y = target;
        vel = 0;
      } else {
        vel += (target - y) * 0.06;
        vel *= 0.82;
        y += vel;
      }

      const sv = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      scrollVel += (sv - scrollVel) * 0.2;

      sleeping = sleeping || performance.now() - lastActivity > SLEEP_AFTER;
      if (Math.abs(scrollVel) > 22) wowUntil = performance.now() + 600;
      const fast = performance.now() < wowUntil;
      const moving = Math.abs(vel) > 0.4 || Math.abs(scrollVel) > 2;
      const mood = sleeping ? 'sleep' : fast ? 'wow' : BASE_MOOD[sectionRef.current] ?? 'normal';

      root.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      root.dataset.mood = mood;
      root.dataset.moving = String(moving && !sleeping);

      // sin inclinarse ni balancear patas con la velocidad: solo acompaña el scroll (y camina, por CSS)

      look.x += (look.tx - look.x) * 0.15;
      look.y += (clamp(look.ty + scrollVel * 0.08, -3, 3) - look.y) * 0.15;
      eyesRef.current?.setAttribute('transform', `translate(${look.x.toFixed(2)} ${look.y.toFixed(2)})`);

      // cada ~120 ms revisa si el globo tapa texto; espera un momento libre antes de reaparecer.
      // En móvil el texto ocupa todo el ancho y siempre "chocaría": ahí Semi se queda visible en la
      // esquina como un asistente de chat y su globo se muestra siempre (se cierra con la ×).
      const now = performance.now();
      if (bubbleRef.current && now - lastCheck > 120) {
        lastCheck = now;
        const hit = !mobile && overlapsText(bubbleRef.current.getBoundingClientRect());
        if (hit) clearSince = 0;
        else if (!clearSince) clearSince = now;
        const next = hit || (coveredRef.current && now - clearSince < 300);
        if (next !== coveredRef.current) {
          coveredRef.current = next;
          setCovered(next);
        }
      }

      if (sleeping && Math.abs(vel) < 0.05 && Math.abs(scrollVel) < 0.05) {
        paused = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const list = MESSAGES[section];
  const msg = list[msgIndex % list.length];

  return (
    <div ref={rootRef} className={styles.mascot} data-pose={section} data-mood="happy">
      {ready && (
        <div
          ref={bubbleRef}
          className={styles.bubble}
          data-hidden={!open || covered}
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            className={styles.bubbleClose}
            onClick={() => setOpen(false)}
            aria-label="Cerrar mensaje de Semi"
          >
            ×
          </button>
          <p key={`${section}-${msgIndex}`} className={styles.bubbleText}>
            {msg.text}
          </p>
          {msg.cta && (
            <Link href={msg.cta.href} className={styles.bubbleLink}>
              {msg.cta.label}
            </Link>
          )}
        </div>
      )}

      <button
        type="button"
        className={styles.mascotButton}
        onClick={() => {
          // clic en Semi: abrir o cerrar a voluntad
          setOpen((o) => !o);
          setAnim((a) => ({ key: a.key + 1, kind: 'spin' }));
        }}
        aria-label={open ? 'Ocultar mensaje de Semi' : 'Mostrar mensaje de Semi'}
        aria-expanded={open}
      >
        {section === 'empezar' && (
          <span key={`c${anim.key}`} className={styles.confetti} aria-hidden="true">
            {CONFETTI.map((c, i) => (
              <span
                key={i}
                style={{ '--dx': `${c.dx}px`, '--dy': `${c.dy}px`, '--r': `${c.r}deg`, '--c': c.c, '--i': i } as CSSProperties}
              />
            ))}
          </span>
        )}

        <div ref={tiltRef} className={styles.pcTilt}>
          <span key={anim.key} className={anim.kind === 'spin' ? styles.pcSpin : styles.pcHop}>
            <SemiFigure eyesRef={eyesRef} />
          </span>
        </div>
      </button>
    </div>
  );
}
