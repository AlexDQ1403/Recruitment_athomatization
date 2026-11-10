import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Sube la HV tal cual (binario): el backend valida tipo y tamaño y la guarda en el bucket privado
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(`${BACKEND_URL}/me/cv`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/octet-stream' },
      body: await req.arrayBuffer(),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(`${BACKEND_URL}/me/cv`, { method: 'DELETE', headers: { Authorization: token } });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
