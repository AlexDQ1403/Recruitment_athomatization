import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function forward(req: NextRequest, method: 'GET' | 'PATCH') {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const init: RequestInit = { method, headers: { Authorization: token } };
    if (method === 'PATCH') {
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(await req.json());
    }
    const res = await fetch(`${BACKEND_URL}/me/profile`, init);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export const GET = (req: NextRequest) => forward(req, 'GET');
export const PATCH = (req: NextRequest) => forward(req, 'PATCH');
