'use client';
import { Toast as ToastType } from '../../types';

interface Props {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'i',
};

const COLORS = {
  success: { bg: 'rgba(52,211,153,.12)', border: 'rgba(52,211,153,.3)', color: '#34d399' },
  error:   { bg: 'rgba(248,113,113,.12)', border: 'rgba(248,113,113,.3)', color: '#f87171' },
  info:    { bg: 'rgba(79,110,247,.12)', border: 'rgba(79,110,247,.3)', color: '#4f6ef7' },
};

export const ToastContainer = ({ toasts, onRemove }: Props) => (
  <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 999 }}>
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
            cursor: 'pointer',
            animation: 'slideUp .2s ease',
            minWidth: 240, maxWidth: 360,
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: c.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {ICONS[t.type]}
          </span>
          <span style={{ fontSize: 13.5, color: 'var(--text-1)', flex: 1 }}>{t.message}</span>
        </div>
      );
    })}
  </div>
);
