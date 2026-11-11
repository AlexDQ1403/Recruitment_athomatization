import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { companyCandidateService } from './companyCandidateService';

const okJson = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

describe('companyCandidateService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('list pide la bandeja con el token y devuelve el resumen de decisiones', async () => {
    const body = { candidates: [], total: 0, limit: 8, offset: 0, summary: { pendiente: 1, contratado: 2, descartado: 3 } };
    fetchMock.mockReturnValue(okJson(body));

    expect(await companyCandidateService.list(8, 0)).toEqual(body);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/company/candidates?limit=8&offset=0');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('decide hace PATCH según el origen del candidato y envía solo la decisión', async () => {
    fetchMock.mockReturnValue(okJson({ decision: 'contratado' }));

    const result = await companyCandidateService.decide({ kind: 'profile', id: 'cp-1' }, 'contratar');

    expect(result.decision).toBe('contratado');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/company/candidates/profile/cp-1/decision');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ decision: 'contratar' });
  });

  it('decide muestra el mensaje del backend (404 no aprobado, 409 ya decidió)', async () => {
    fetchMock.mockReturnValue(okJson({ error: 'Ya decidiste sobre este candidato: contratado' }, 409));
    await expect(companyCandidateService.decide({ kind: 'legacy', id: 'l1' }, 'descartar')).rejects.toThrow('Ya decidiste');

    fetchMock.mockReturnValue(okJson({ error: 'Candidato no encontrado' }, 404));
    await expect(companyCandidateService.decide({ kind: 'legacy', id: 'l1' }, 'contratar')).rejects.toThrow('Candidato no encontrado');
  });

  it('sin sesión no llama a la red', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(companyCandidateService.decide({ kind: 'legacy', id: 'l1' }, 'contratar')).rejects.toThrow('No autorizado');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
