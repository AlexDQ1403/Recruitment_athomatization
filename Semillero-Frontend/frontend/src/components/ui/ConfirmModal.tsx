'use client';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

export const ConfirmModal = ({ message, onConfirm, onCancel, confirmLabel = 'Confirmar', danger = true }: Props) => (
  <div className="modal-overlay" onClick={onCancel}>
    <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ color: 'var(--text-1)', fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13 }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: danger ? 'color-mix(in srgb, var(--red) 14%, transparent)' : 'var(--accent)',
              border: `1px solid ${danger ? 'color-mix(in srgb, var(--red) 35%, transparent)' : 'var(--accent)'}`,
              color: danger ? 'var(--red)' : 'var(--text-inv)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  </div>
);
