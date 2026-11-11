import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../../lib/backendProxy';

export const maxDuration = 60;

export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  proxyToBackend(req, `/me/vacancies/${encodeURIComponent(params.id)}/advice`, 'POST');
