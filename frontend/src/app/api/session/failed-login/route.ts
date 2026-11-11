import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Público a propósito: un login fallido no tiene token que enviar. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await fetch(`${BACKEND_URL}/session/failed-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: body?.reason }),
    });
  } catch {
    // La traza no puede afectar al mensaje que ve el usuario.
  }
  return new NextResponse(null, { status: 204 });
}
