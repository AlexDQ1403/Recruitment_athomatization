import { supabase } from '../lib/supabase';
import { CompanyCandidateProcess, CompanyDecision } from '../types';

export interface CompanyCandidatesResponse {
  candidates: CompanyCandidateProcess[];
  total: number;
  limit: number;
  offset: number;
  /** Conteo de TODA la bandeja por decisión de la empresa (no solo de la página). */
  summary: Record<CompanyDecision, number>;
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

export const companyCandidateService = {
  async list(limit = 50, offset = 0): Promise<CompanyCandidatesResponse> {
    const res = await fetch(`/api/company/candidates?limit=${limit}&offset=${offset}`, {
      headers: await authHeaders(),
    });
    return handle<CompanyCandidatesResponse>(res, 'Error al cargar los candidatos presentados');
  },

  async decide(
    candidate: Pick<CompanyCandidateProcess, 'kind'> & { id: string },
    decision: 'contratar' | 'descartar',
    /** Por qué: se le muestra al reclutador que lo presentó. */
    reason?: string
  ): Promise<{ decision: CompanyDecision; unchanged?: boolean }> {
    const res = await fetch(
      `/api/company/candidates/${candidate.kind}/${encodeURIComponent(candidate.id)}/decision`,
      {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
      }
    );
    return handle(res, 'No se pudo registrar la decisión');
  },
};
