'use client';
import { useEffect, useRef, useState } from 'react';
import { LandingTheme, useLandingTheme } from './ThemeToggle';

// Degradados de marca: del azul (#112454 y sus tonos) al rojo (#c81b1d).
// Cada partícula toma el color según su posición, así la figura se lee como un degradado continuo.
const PALETTES: Record<LandingTheme, string[]> = {
  dark: ['#2f4a8f', '#3d5ba8', '#5a78c0', '#809bd4', '#b4c5e8', '#e8b4b5', '#e5484d', '#c81b1d'],
  light: ['#112454', '#162c62', '#1f3a80', '#2c4d99', '#3d5ba8', '#7b2f4f', '#a8151a', '#c81b1d'],
};
const COLOR_COUNT = 8;

// Posición (-1..1) → índice del degradado; diagonal de arriba-izquierda (azul) a abajo-derecha (rojo)
const colorAt = (x: number, y: number, jitter: number) => {
  const t = Math.max(0, Math.min(1, (x * 0.7 + y * 0.5 + 1.2) / 2.4 + jitter));
  // se inclina hacia el azul: el rojo queda como acento
  return Math.min(COLOR_COUNT - 1, Math.floor(Math.pow(t, 1.35) * COLOR_COUNT));
};

type Point = [number, number];

interface Shape {
  label: string;
  /** Trazo SVG en un viewBox de 24×24; sin trazo = forma de "red de talento" */
  path?: string;
}

// Secuencia de figuras que recorre la constelación
const SHAPES: Shape[] = [
  { label: 'Buscar candidatos', path: 'M18 11a7 7 0 1 1-14 0a7 7 0 1 1 14 0M21 21l-5-5' },
  {
    label: 'Vacantes abiertas',
    path: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20M12 12v2',
  },
  {
    label: 'Hojas de vida',
    path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h2',
  },
  {
    label: 'Chat con IA',
    path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5',
  },
  {
    label: 'Perfiles de candidatos',
    path: 'M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  },
  {
    label: 'Postulación enviada',
    path: 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0M7.5 12.5l3 3l6-6.5',
  },
];

const MORPH = 1.8; // segundos que tarda en transformarse
const HOLD = 3.4; // segundos que se mantiene cada figura
const INTRO = 2.6;
const STAGGER = 0.35;

interface Particle {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  // dirección de dispersión durante la transición
  kx: number;
  ky: number;
  delay: number;
  size: number;
  rot: number;
  spin: number;
  jitter: number;
  phase: number;
  alpha: number;
}

interface Props {
  count?: number;
  ambient?: number;
  /** Escala de la figura respecto al lienzo (0..1) */
  scale?: number;
  className?: string;
  captionClassName?: string;
}

const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

// Contorno orgánico tipo "cerebro/nube": radio modulado por varias ondas
const shapeRadius = (theta: number) =>
  1 +
  0.07 * Math.sin(5 * theta + 0.6) +
  0.05 * Math.sin(9 * theta + 1.3) +
  0.03 * Math.sin(14 * theta + 2.1);

function sampleNetwork(n: number, rand: () => number): Point[] {
  const pts: Point[] = [];
  while (pts.length < n) {
    const x = rand() * 2 - 1;
    const y = rand() * 2 - 1;
    const r = Math.hypot(x, y);
    const edge = shapeRadius(Math.atan2(y, x));
    if (r > edge) continue;
    const t = r / edge;
    if (rand() > 0.35 + 0.65 * t * t) continue;
    if (Math.abs(x + 0.05 * Math.sin(y * 4)) < 0.035 && y < 0.55 && rand() < 0.8) continue;
    pts.push([x * 1.12, y * 0.95]);
  }
  return pts;
}

// Rasteriza el ícono en un lienzo oculto y toma puntos sobre el trazo
function sampleIcon(d: string, n: number, rand: () => number): Point[] {
  const size = 180;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return sampleNetwork(n, rand);
  g.scale(size / 24, size / 24);
  g.lineWidth = 1.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#fff';
  g.stroke(new Path2D(d));
  const data = g.getImageData(0, 0, size, size).data;
  const hits: Point[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (data[(y * size + x) * 4 + 3] > 110) hits.push([(x / size) * 2 - 1, (y / size) * 2 - 1]);
    }
  }
  if (!hits.length) return sampleNetwork(n, rand);
  const k = 1.18; // los íconos ocupan ~83 % del viewBox; se amplían para igualar la red
  return Array.from({ length: n }, () => {
    const [x, y] = hits[Math.floor(rand() * hits.length)];
    return [x * k + (rand() - 0.5) * 0.03, y * k + (rand() - 0.5) * 0.03] as Point;
  });
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function Constellation({
  count = 1300,
  ambient = 140,
  scale = 0.36,
  className,
  captionClassName,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shapeIndex, setShapeIndex] = useState(0);
  const { theme } = useLandingTheme();
  const paletteRef = useRef(PALETTES[theme]);
  paletteRef.current = PALETTES[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = seeded(20260925);
    const targets = SHAPES.map((s) => (s.path ? sampleIcon(s.path, count, rand) : sampleNetwork(count, rand)));

    const particles: Particle[] = targets[0].map(([tx, ty]) => {
      const a = rand() * Math.PI * 2;
      const d = 1.4 + rand() * 1.2;
      const sx = Math.cos(a) * d;
      const sy = Math.sin(a) * d;
      const ka = rand() * Math.PI * 2;
      return {
        x: sx,
        y: sy,
        fromX: sx,
        fromY: sy,
        toX: tx,
        toY: ty,
        kx: Math.cos(ka),
        ky: Math.sin(ka),
        delay: rand() * STAGGER,
        size: 1.5 + rand() * 2.4,
        rot: rand() * Math.PI * 2,
        spin: (rand() - 0.5) * 0.6,
        jitter: (rand() - 0.5) * 0.14,
        phase: rand() * Math.PI * 2,
        alpha: 0.55 + rand() * 0.45,
      };
    });

    const dust = Array.from({ length: ambient }, () => ({
      x: rand() * 3.2 - 1.6,
      y: rand() * 2.8 - 1.4,
      size: 1.3 + rand() * 1.8,
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 0.4,
      jitter: (rand() - 0.5) * 0.14,
      phase: rand() * Math.PI * 2,
    }));

    const pointer = { x: -9999, y: -9999 };
    let width = 0;
    let height = 0;
    let raf = 0;
    let visible = true;
    let clock = 0; // solo avanza mientras se dibuja
    let last = performance.now();
    let current = 0;
    let morphStart = 0;
    let morphLength = INTRO;

    if (reduceMotion) {
      for (const p of particles) {
        p.fromX = p.toX;
        p.fromY = p.toY;
      }
    }

    const nextShape = () => {
      current = (current + 1) % SHAPES.length;
      const pts = targets[current];
      particles.forEach((p, i) => {
        p.fromX = p.toX;
        p.fromY = p.toY;
        p.toX = pts[i][0];
        p.toY = pts[i][1];
      });
      morphStart = clock;
      morphLength = MORPH;
      setShapeIndex(current);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const triangle = (path: Path2D, x: number, y: number, s: number, rot: number) => {
      for (let k = 0; k < 3; k++) {
        const a = rot + (k * Math.PI * 2) / 3;
        const px = x + Math.cos(a) * s;
        const py = y + Math.sin(a) * s;
        if (k === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();
    };

    const draw = (now: number) => {
      clock += Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!reduceMotion && clock - morphStart > morphLength + HOLD) nextShape();

      const cx = width / 2;
      const cy = height / 2;
      const unit = Math.min(width, height) * scale;
      const breathe = reduceMotion ? 1 : 1 + 0.015 * Math.sin(clock * 0.8);
      const drift = reduceMotion ? 0 : 0.01;
      const raw = (clock - morphStart) / morphLength;

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;

      const colors = paletteRef.current;
      const paths = colors.map(() => new Path2D());
      const dustPaths = colors.map(() => new Path2D());

      for (const p of particles) {
        const local = reduceMotion ? 1 : clamp01((raw - p.delay) / (1 - STAGGER));
        const e = easeInOut(local);
        // durante la transición las partículas se abren y vuelven a agruparse
        const burst = Math.sin(Math.PI * e) * 0.2;
        p.x = p.fromX + (p.toX - p.fromX) * e + p.kx * burst + Math.sin(clock * 0.6 + p.phase) * drift;
        p.y = p.fromY + (p.toY - p.fromY) * e + p.ky * burst + Math.cos(clock * 0.5 + p.phase) * drift;

        let x = cx + p.x * unit * breathe;
        let y = cy + p.y * unit * breathe;

        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 90 && dist > 0.01) {
          const push = (1 - dist / 90) * 18;
          x += (dx / dist) * push;
          y += (dy / dist) * push;
        }

        triangle(paths[colorAt(p.x, p.y, p.jitter)], x, y, p.size, p.rot + (reduceMotion ? 0 : clock * p.spin));
      }

      for (const d of dust) {
        const x = cx + (d.x + Math.sin(clock * 0.3 + d.phase) * drift * 2) * unit;
        const y = cy + (d.y + Math.cos(clock * 0.25 + d.phase) * drift * 2) * unit;
        triangle(dustPaths[colorAt(d.x * 0.7, d.y * 0.7, d.jitter)], x, y, d.size, d.rot + (reduceMotion ? 0 : clock * d.spin));
      }

      colors.forEach((color, i) => {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.stroke(dustPaths[i]);
        ctx.globalAlpha = 0.8;
        ctx.stroke(paths[i]);
      });
      ctx.globalAlpha = 1;

      if (!reduceMotion && visible) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduceMotion) draw(performance.now());
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      const wasVisible = visible;
      visible = entry.isIntersecting;
      if (visible && !wasVisible && !reduceMotion) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    });
    io.observe(canvas);

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [count, ambient, scale]);

  return (
    <>
      <canvas ref={canvasRef} className={className} aria-hidden="true" />
      <p className={captionClassName} aria-hidden="true">
        <span key={shapeIndex}>{SHAPES[shapeIndex].label}</span>
      </p>
    </>
  );
}
