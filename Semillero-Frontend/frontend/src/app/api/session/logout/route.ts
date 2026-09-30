import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(`${BACKEND_URL}/session/logout`, {
      method: 'POST',
      headers: { Authorization: token },
    });
    return new NextResponse(null, { status: res.status === 204 ? 204 : res.status });
  } catch {
    // La auditoría no debe impedir entrar ni salir
    return new NextResponse(null, { status: 204 });
  }
}
