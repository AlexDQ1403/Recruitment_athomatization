import { NextRequest, NextResponse } from 'next/server';
import { backendJson } from '../../../lib/backendProxy';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Vacantes de la empresa del usuario. La empresa la decide el backend a partir de la sesión.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(`${BACKEND_URL}/vacancies${req.nextUrl.search}`, { headers: { Authorization: token } });
    const data = await backendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// Publicar una vacante.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_URL}/vacancies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify(body),
    });
    const data = await backendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
