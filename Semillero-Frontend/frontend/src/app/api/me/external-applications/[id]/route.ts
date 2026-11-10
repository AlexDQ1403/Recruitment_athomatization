import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../lib/backendProxy';

type Ctx = { params: { id: string } };

export const PATCH = (req: NextRequest, { params }: Ctx) => proxyToBackend(req, `/me/external-applications/${encodeURIComponent(params.id)}`, 'PATCH');
export const DELETE = (req: NextRequest, { params }: Ctx) => proxyToBackend(req, `/me/external-applications/${encodeURIComponent(params.id)}`, 'DELETE');
