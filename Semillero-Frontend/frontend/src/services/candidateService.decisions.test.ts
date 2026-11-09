import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { candidateService } from './candidateService';

const okJson = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

const ID = '11111111-1111-4111-8111-111111111111';

describe('candidateService.decide', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('envía PATCH con el token, la decisión y el motivo opcional', async () => {
    fetchMock.mockReturnValue(okJson({ id: ID, status: 'seguimiento', presented: false }));

    const result = await candidateService.decide(ID, 'seguimiento', 'Esperar presupuesto');

    expect(result).toEqual({ id: ID, status: 'seguimiento', presented: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/candidates/${ID}/decision`);
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ decision: 'seguimiento', reason: 'Esperar presupuesto' });
  });

  it('sin motivo no envía el campo reason', async () => {
    fetchMock.mockReturnValue(okJson({ id: ID, status: 'seguimiento', presented: true }));
    await candidateService.decide(ID, 'aprobar');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: 'aprobar' });
  });

  it('propaga el mensaje del backend cuando la decisión se rechaza (409 terminal)', async () => {
    fetchMock.mockReturnValue(okJson({ error: 'Un candidato rechazado no se puede reactivar' }, 409));
    await expect(candidateService.decide(ID, 'aprobar')).rejects.toThrow('Un candidato rechazado no se puede reactivar');
  });

  it('sin sesión no llama a la red', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(candidateService.decide(ID, 'aprobar')).rejects.toThrow('No autorizado');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('candidateService.getDecisions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sin ids no llama a la red', async () => {
    expect(await candidateService.getDecisions([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplica ids y devuelve el estado de los encontrados', async () => {
    fetchMock.mockReturnValue(okJson({ [ID]: { status: 'seguimiento', presented: true } }));

    const result = await candidateService.getDecisions([ID, ID]);

    expect(result).toEqual({ [ID]: { status: 'seguimiento', presented: true } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/candidates/decisions?ids=${ID}`);
  });

  it('parte las consultas en bloques de 100 ids (el backend rechaza más)', async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    fetchMock.mockImplementation(() => okJson({}));

    await candidateService.getDecisions(ids);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(([u]) => (u as string).split('ids=')[1].split(',').length);
    expect(sizes).toEqual([100, 100, 30]);
  });

  it('une los resultados de todos los bloques', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    fetchMock
      .mockReturnValueOnce(okJson({ [ids[0]]: { status: 'seguimiento', presented: false } }))
      .mockReturnValueOnce(okJson({ [ids[100]]: { status: 'en_contacto', presented: false } }));

    const result = await candidateService.getDecisions(ids);

    expect(Object.keys(result).sort()).toEqual([ids[0], ids[100]].sort());
  });

  it('falla si el backend responde con error (el chat reintenta luego)', async () => {
    fetchMock.mockReturnValue(okJson({ error: 'x' }, 500));
    await expect(candidateService.getDecisions([ID])).rejects.toThrow();
  });
});
