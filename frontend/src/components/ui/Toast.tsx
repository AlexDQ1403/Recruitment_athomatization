'use client';
import { Toast as ToastType } from '../../types';
import { Icon } from './Icon';

interface Props {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const ICONS = {
  success: <Icon name="check" size={12} style={{ strokeWidth: 3 }} />,
  error: <Icon name="x" size={12} style={{ strokeWidth: 3 }} />,
  info: 'i',
};

const COLORS = {
  success: { bg: 'color-mix(in srgb, var(--green) 12%, var(--surface))', border: 'color-mix(in srgb, var(--green) 35%, transparent)', color: 'var(--green)' },
  error:   { bg: 'color-mix(in srgb, var(--red) 12%, var(--surface))', border: 'color-mix(in srgb, var(--red) 35%, transparent)', color: 'var(--red)' },
  info:    { bg: 'color-mix(in srgb, var(--blue) 12%, var(--surface))', border: 'color-mix(in srgb, var(--blue) 35%, transparent)', color: 'var(--blue)' },
};

export const ToastContainer = ({ toasts, onRemove }: Props) => (
  <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 999 }}>
    {toasts.map((t) => {    
      const c = COLORS[t.type];
      return (
        <div
          key={t.id}
          onClick={() => onRemove(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px',
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            cursor: 'pointer',
            animation: 'slideUp 220ms var(--ease)',
            minWidth: 240, maxWidth: 360,
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: c.color, color: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {ICONS[t.type]}
          </span>
          <span style={{ fontSize: 13.5, color: 'var(--text-1)', flex: 1 }}>{t.message}</span>
        </div>
      );
    })}
  </div>
);
