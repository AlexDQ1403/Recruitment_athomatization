import { NextRequest, NextResponse } from 'next/server';
import { backendJson } from '../../../../../../lib/backendProxy';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Rechaza al candidato para un puesto (cargo y/o vacante). La autorización la decide el backend.
export async function POST(req: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const res = await fetch(
      `${BACKEND_URL}/candidate-profiles/${encodeURIComponent(params.kind)}/${encodeURIComponent(params.id)}/rejections`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
      }
    );
    const data = await backendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
