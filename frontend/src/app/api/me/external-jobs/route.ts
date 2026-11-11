import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../lib/backendProxy';

// Consulta portales externos: puede tardar unos segundos
export const maxDuration = 30;

export const GET = (req: NextRequest) => proxyToBackend(req, '/me/external-jobs', 'GET');
