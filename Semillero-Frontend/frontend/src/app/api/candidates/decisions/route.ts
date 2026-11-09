import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Estado vigente de varios candidatos (para las tarjetas del chat): ?ids=a,b,c
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const ids = req.nextUrl.searchParams.get('ids') ?? '';
    const res = await fetch(`${BACKEND_URL}/candidates/decisions?ids=${encodeURIComponent(ids)}`, {
      headers: { Authorization: token },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
