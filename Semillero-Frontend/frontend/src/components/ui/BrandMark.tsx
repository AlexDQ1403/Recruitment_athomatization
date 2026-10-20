/* eslint-disable @next/next/no-img-element */

// Logo de Kmella: el monograma "km" con el camello, recortado del diseño original de la marca,
// con "kmella" debajo (sin "portal de empleo"). Hay tres versiones del monograma en /public/brand:
// - km-light: colores originales (fondo claro)
// - km-dark: letras blancas, camello rojo (fondo oscuro)
// - km-onred: letras blancas, camello azul marino (sobre el rojo de la marca, p. ej. el pie)
// En "auto" se muestra la clara o la oscura según el tema (ver .brand-img-* en globals.css).

const RATIO = 495 / 297; // ancho / alto del monograma recortado

type Variant = 'auto' | 'onred';

export function BrandMonogram({ height = 34, variant = 'auto' }: { height?: number; variant?: Variant }) {
  const size = { height, width: Math.round(height * RATIO) };
  if (variant === 'onred') {
    return <img src="/brand/km-onred.png" alt="" aria-hidden="true" {...size} style={{ display: 'block' }} />;
  }
  return (
    <>
      <img src="/brand/km-light.png" alt="" aria-hidden="true" {...size} className="brand-img-light" />
      <img src="/brand/km-dark.png" alt="" aria-hidden="true" {...size} className="brand-img-dark" />
    </>
  );
}

// Logo completo como en el diseño: monograma arriba y "kmella" centrado debajo
export function BrandLogo({ height = 34, variant = 'auto', className }: { height?: number; variant?: Variant; className?: string }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: height * 0.06 }}
    >
      <BrandMonogram height={height} variant={variant} />
      <span
        style={{
          fontFamily: 'var(--font-brand), Montserrat, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: height * 0.44,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          color: 'var(--brand-ink, currentColor)',
        }}
      >
        kmella
      </span>
    </span>
  );
}
