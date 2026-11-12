import { NextRequest, NextResponse } from 'next/server';
import { backendJson, clientHeaders, fetchBackend } from '../../../../lib/backendProxy';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetchBackend(`${BACKEND_URL}/register/company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientHeaders(req) },
      body: JSON.stringify(body),
    });
    const data = await backendJson(res);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
