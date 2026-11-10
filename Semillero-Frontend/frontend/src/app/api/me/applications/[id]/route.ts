import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../lib/backendProxy';

export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  proxyToBackend(req, `/me/applications/${encodeURIComponent(params.id)}`, 'PATCH');
