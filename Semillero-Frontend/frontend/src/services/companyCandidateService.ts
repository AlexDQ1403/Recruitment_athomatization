import { supabase } from '../lib/supabase';
import { CompanyCandidateProcess } from '../types';

interface CompanyCandidatesResponse {
  candidates: CompanyCandidateProcess[];
  total: number;
  limit: number;
  offset: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autorizado');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json() as Promise<T>;
}

/**
 * Bandeja de la Empresa: solo candidatos que un reclutador presentó
 * explícitamente (ver backend/src/routes/company-candidates.ts).
 */
export const companyCandidateService = {
  async list(limit = 50, offset = 0): Promise<CompanyCandidatesResponse> {
    const res = await fetch(`/api/company/candidates?limit=${limit}&offset=${offset}`, {
      headers: await authHeaders(),
    });
    return handle<CompanyCandidatesResponse>(res, 'Error al cargar los candidatos presentados');
  },
};
