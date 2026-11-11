import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Cuerpo de la respuesta del backend; si no es JSON (p. ej. un 429), un error legible */
export async function backendJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({
    error: res.status === 429
      ? 'Demasiadas solicitudes: espera un momento e inténtalo de nuevo.'
      : 'El servidor respondió algo inesperado. Inténtalo de nuevo.',
  }));
}

/** IP y navegador de quien hace la petición: el backend los guarda como prueba de la autorización de datos */
export function clientHeaders(req: NextRequest): Record<string, string> {
  const h: Record<string, string> = {};
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
  const ua = req.headers.get('user-agent');
  if (ip) h['x-client-ip'] = ip.slice(0, 200);
  if (ua) h['x-client-user-agent'] = ua.slice(0, 300);
  return h;
}

/** Reenvía la petición al backend con el token de la sesión (mismo patrón que las demás rutas /api/me). */
export async function proxyToBackend(req: NextRequest, path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE'): Promise<NextResponse> {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(await req.json().catch(() => ({})));
    const res = await fetch(`${BACKEND_URL}${path}${req.nextUrl.search}`, {
      method,
      headers: { Authorization: token, ...clientHeaders(req), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body,
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(await backendJson(res), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
