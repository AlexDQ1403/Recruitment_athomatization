import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../lib/backendProxy';

/** Autorización de tratamiento de datos de la cuenta con sesión */
export const GET = (req: NextRequest) => proxyToBackend(req, '/consent', 'GET');
export const POST = (req: NextRequest) => proxyToBackend(req, '/consent', 'POST');
