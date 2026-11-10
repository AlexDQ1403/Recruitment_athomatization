import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../lib/backendProxy';

export const GET = (req: NextRequest) => proxyToBackend(req, '/me/dashboard', 'GET');
