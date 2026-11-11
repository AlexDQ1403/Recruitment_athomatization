import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../lib/backendProxy';

// Leer la HV con IA puede tardar: no se corta antes que el backend
export const maxDuration = 60;

export const POST = (req: NextRequest) => proxyToBackend(req, '/me/cv/extract', 'POST');
