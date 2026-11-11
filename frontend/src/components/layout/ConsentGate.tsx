'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { LEGAL } from '../../lib/legal';

/**
 * Pide aceptar la Política de Datos y los Términos a quien aún no aceptó la versión
 * vigente: cuentas creadas antes de estos documentos, reclutadores invitados (no pasan
 * por el registro) o cuando cambia la versión. Sin aceptar no se usa la app.
 */
export function ConsentGate({ onLogout }: { onLogout: () => void }) {
  const [needed, setNeeded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/consent', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) return; // si el servicio falla no bloqueamos el trabajo
        const body = await res.json();
        if (!cancelled && body.accepted === false) setNeeded(true);
      } catch {
        /* sin conexión: se vuelve a preguntar en la próxima carga */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!needed) return null;

  const accept = async () => {
    if (!checked) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ accept: true, version: LEGAL.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'No pudimos guardar tu aceptación. Inténtalo de nuevo.');
      }
      setNeeded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar tu aceptación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay consent-overlay">
      <div className="modal consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title">Antes de continuar</h2>
        <p>
          Para usar {LEGAL.brand} necesitamos tu autorización para tratar tus datos personales, como lo exige la Ley 1581 de
          2012. Te explicamos qué datos usamos, para qué y cómo ejercer tus derechos de conocerlos, corregirlos o pedir que los
          borremos.
        </p>
        <ul className="consent-docs">
          <li><Link href="/privacidad" target="_blank">Política de Tratamiento de Datos Personales</Link></li>
          <li><Link href="/terminos" target="_blank">Términos y Condiciones</Link></li>
        </ul>
        <label className="consent-check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>
            Leí y autorizo el tratamiento de mis datos según la Política de Tratamiento de Datos, y acepto los Términos y
            Condiciones.
          </span>
        </label>
        {error && <p className="consent-error" role="alert">{error}</p>}
        <div className="consent-actions">
          <button type="button" className="btn-secondary-sm" onClick={onLogout}>No acepto, cerrar sesión</button>
          <button type="button" className="btn-primary" onClick={accept} disabled={!checked || saving}>
            {saving ? 'Guardando…' : 'Aceptar y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
