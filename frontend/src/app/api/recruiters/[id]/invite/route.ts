import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../lib/backendProxy';

export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  proxyToBackend(req, `/recruiters/${encodeURIComponent(params.id)}/invite`, 'POST');
