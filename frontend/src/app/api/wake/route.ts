import { NextResponse } from 'next/server';
import { BACKEND_HEALTH_URL } from '../../../lib/backendProxy';

export const dynamic = 'force-dynamic';

/**
 * Despierta el backend (Render free lo duerme tras ~15 min sin uso).
 * Las páginas de registro lo llaman al abrirse para que, cuando el usuario
 * envíe el formulario, el backend ya esté arriba.
 */
export async function GET() {
  try {
    const res = await fetch(BACKEND_HEALTH_URL, { cache: 'no-store', signal: AbortSignal.timeout(90_000) });
    return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
