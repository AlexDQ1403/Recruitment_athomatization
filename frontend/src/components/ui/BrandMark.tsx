/* eslint-disable @next/next/no-img-element */


const RATIO = 495 / 297; // ancho / alto del monograma recortado

type Variant = 'auto' | 'onred';

export function BrandMonogram({ height = 34, variant = 'auto' }: { height?: number; variant?: Variant }) {
  const size = { height, width: Math.round(height * RATIO) };
  if (variant === 'onred') {
    return <img src="/brand/km-onred.webp" alt="" aria-hidden="true" {...size} style={{ display: 'block' }} />;
  }
  return (
    <>
      <img src="/brand/km-light.webp" alt="" aria-hidden="true" {...size} className="brand-img-light" />
      <img src="/brand/km-dark.webp" alt="" aria-hidden="true" {...size} className="brand-img-dark" />
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
