import { NextRequest, NextResponse } from 'next/server';
import { backendJson } from '../../../../../../../../lib/backendProxy';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// El reclutador aprueba al candidato: desde entonces la empresa lo ve.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; kind: string; applicantId: string } }
) {
  const token = req.headers.get('authorization');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const res = await fetch(
      `${BACKEND_URL}/vacancies/${encodeURIComponent(params.id)}/applicants/${encodeURIComponent(params.kind)}/${encodeURIComponent(params.applicantId)}/approve`,
      { method: 'POST', headers: { Authorization: token } }
    );
    const data = await backendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
