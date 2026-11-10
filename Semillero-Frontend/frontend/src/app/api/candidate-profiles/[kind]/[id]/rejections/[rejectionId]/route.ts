import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Deshace un rechazo por puesto.
export async function DELETE(req: NextRequest, { params }: { params: { kind: string; id: string; rejectionId: string } }) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(
      `${BACKEND_URL}/candidate-profiles/${encodeURIComponent(params.kind)}/${encodeURIComponent(params.id)}/rejections/${encodeURIComponent(params.rejectionId)}`,
      { method: 'DELETE', headers: { Authorization: token } }
    );
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
