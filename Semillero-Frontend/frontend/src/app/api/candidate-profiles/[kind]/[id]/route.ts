import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Perfil completo con datos de contacto. La autorización la decide el backend (rol y empresa del token).
export async function GET(req: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(
      `${BACKEND_URL}/candidate-profiles/${encodeURIComponent(params.kind)}/${encodeURIComponent(params.id)}`,
      { headers: { Authorization: token }, cache: 'no-store' }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
