'use client';

export type AlertSeverity = 'error' | 'warning' | 'info' | 'success';

interface AlertAction {
  label: string;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
}

interface Props {
  severity: AlertSeverity;
  title: string;
  detail?: string;
  /** Acciones que resuelven la causa del aviso (reenviar correo, ir a registro...). */
  actions?: AlertAction[];
  onDismiss?: () => void;
}

const ICON: Record<AlertSeverity, React.ReactNode> = {
  error: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  warning: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  success: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
};

export const Alert = ({ severity, title, detail, actions, onDismiss }: Props) => (
  <div
    className={`alert alert-${severity}`}
    // assertive para error: el lector de pantalla lo anuncia al instante,
    // que es lo que se espera de un fallo de acceso.
    role={severity === 'error' ? 'alert' : 'status'}
    aria-live={severity === 'error' ? 'assertive' : 'polite'}
  >
    <span className="alert-icon" aria-hidden="true">{ICON[severity]}</span>

    <div className="alert-body">
      <p className="alert-title">{title}</p>
      {detail && <p className="alert-detail">{detail}</p>}

      {actions && actions.length > 0 && (
        <div className="alert-actions">
          {actions.map((a) =>
            a.href ? (
              <a key={a.label} href={a.href} className="alert-action">{a.label}</a>
            ) : (
              <button
                key={a.label}
                type="button"
                className="alert-action"
                onClick={a.onClick}
                disabled={a.loading}
              >
                {a.loading ? 'Enviando...' : a.label}
              </button>
            )
          )}
        </div>
      )}
    </div>

    {onDismiss && (
      <button type="button" className="alert-dismiss" onClick={onDismiss} aria-label="Cerrar aviso">
        ×
      </button>
    )}
  </div>
);
