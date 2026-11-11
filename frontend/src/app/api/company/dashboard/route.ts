import { NextRequest, NextResponse } from 'next/server';
import { backendJson } from '../../../../lib/backendProxy';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Dashboard de la empresa: el backend lo arma con la empresa de la sesión.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(`${BACKEND_URL}/company/dashboard`, { headers: { Authorization: token } });
    const data = await backendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
