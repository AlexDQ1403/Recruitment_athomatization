import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { vacancyService } from './vacancyService';

const okJson = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

const ID = '11111111-1111-4111-8111-111111111111';

describe('vacancyService (todo pasa por el backend)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('create', () => {
    const input = { title: 'Desarrollador React', modality: 'remoto' as const, skills: ['React'] };

    it('publica por la API con el token y SIN nombre de empresa (lo pone el servidor)', async () => {
      fetchMock.mockReturnValue(okJson({ id: 'v1', status: 'active', company: 'Acme' }, 201));

      const result = await vacancyService.create(input);

      expect(result).toMatchObject({ id: 'v1', status: 'active' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/vacancies');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer tok');
      const sent = JSON.parse(init.body);
      expect(sent).toEqual(input);
      expect(sent).not.toHaveProperty('company');
      expect(sent).not.toHaveProperty('company_id');
    });

    it('muestra el mensaje que devuelve el backend (validación, permisos, base desactualizada)', async () => {
      fetchMock.mockReturnValue(okJson({ error: 'El salario mínimo no puede superar al máximo' }, 400));
      await expect(vacancyService.create(input)).rejects.toThrow('El salario mínimo no puede superar al máximo');
    });

    it('si el backend no responde un JSON válido, da un mensaje claro', async () => {
      fetchMock.mockReturnValue(Promise.resolve({ ok: false, status: 502, json: async () => { throw new Error('x'); } } as unknown as Response));
      await expect(vacancyService.create(input)).rejects.toThrow('No se pudo publicar la vacante');
    });

    it('sin sesión no llama a la red', async () => {
      getSession.mockResolvedValue({ data: { session: null } });
      await expect(vacancyService.create(input)).rejects.toThrow('No autorizado');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('REGRESIÓN lista vacía: pide las vacantes al backend (no a Supabase con RLS) con token, página y estado', async () => {
      const page = { items: [{ id: ID, title: 'Python', status: 'active', applicants_count: 2 }], total: 1, page: 1, limit: 50, totalPages: 1 };
      fetchMock.mockReturnValue(okJson(page));

      const result = await vacancyService.list(1, 50, 'active');

      expect(result).toEqual(page);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/vacancies?page=1&limit=50&status=active');
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('sin filtro de estado no envía el parámetro status', async () => {
      fetchMock.mockReturnValue(okJson({ items: [], total: 0, page: 1, limit: 12, totalPages: 0 }));
      await vacancyService.list();
      expect(fetchMock.mock.calls[0][0]).toBe('/api/vacancies?page=1&limit=12');
    });

    it('si falla muestra el mensaje del backend', async () => {
      fetchMock.mockReturnValue(okJson({ error: 'Las vacantes no están disponibles por una actualización pendiente' }, 503));
      await expect(vacancyService.list()).rejects.toThrow('actualización pendiente');
    });
  });

  describe('update', () => {
    it('edita por PATCH y envía los vacíos tal cual: el servidor los guarda como null', async () => {
      fetchMock.mockReturnValue(okJson({ id: ID, title: 'Nuevo' }));

      await vacancyService.update(ID, { title: 'Nuevo', description: '', deadline: '' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/vacancies/${ID}`);
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ title: 'Nuevo', description: '', deadline: '' });
    });

    it('pausar o activar solo envía el estado', async () => {
      fetchMock.mockReturnValue(okJson({ id: ID, status: 'paused' }));
      await vacancyService.update(ID, { status: 'paused' });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'paused' });
    });

    it('propaga el 404 de una vacante de otra empresa', async () => {
      fetchMock.mockReturnValue(okJson({ error: 'Vacante no encontrada' }, 404));
      await expect(vacancyService.update(ID, { status: 'closed' })).rejects.toThrow('Vacante no encontrada');
    });
  });

  describe('candidatos de la vacante', () => {
    it('applicants pide la lista al backend con el token', async () => {
      const body = { items: [{ kind: 'legacy', id: ID, full_name: 'Carlos', title: 'Dev', status: 'seguimiento' }], total: 1 };
      fetchMock.mockReturnValue(okJson(body));

      expect(await vacancyService.applicants(ID)).toEqual(body);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/vacancies/${ID}/applicants`);
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('applicants propaga el 404 de una vacante ajena', async () => {
      fetchMock.mockReturnValue(okJson({ error: 'Vacante no encontrada' }, 404));
      await expect(vacancyService.applicants(ID)).rejects.toThrow('Vacante no encontrada');
    });

    it('setApplicantStatus hace PATCH al candidato según su origen, enviando solo el estado', async () => {
      fetchMock.mockReturnValue(okJson({ kind: 'profile', id: 'cp-1', status: 'en_contacto' }));

      await vacancyService.setApplicantStatus(ID, { kind: 'profile', id: 'cp-1' }, 'en_contacto');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/vacancies/${ID}/applicants/profile/cp-1/status`);
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ status: 'en_contacto' });
    });

    it('approveApplicant hace POST al candidato según su origen, sin cuerpo', async () => {
      fetchMock.mockReturnValue(okJson({ kind: 'legacy', id: 'c1', presented: true }));

      await vacancyService.approveApplicant(ID, { kind: 'legacy', id: 'c1' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/vacancies/${ID}/applicants/legacy/c1/approve`);
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('approveApplicant muestra el 409 de un candidato rechazado', async () => {
      fetchMock.mockReturnValue(okJson({ error: 'Un candidato rechazado no se puede aprobar' }, 409));
      await expect(vacancyService.approveApplicant(ID, { kind: 'profile', id: 'cp' })).rejects.toThrow('no se puede aprobar');
    });

    it('setApplicantStatus muestra el 409 de un candidato rechazado', async () => {
      fetchMock.mockReturnValue(okJson({ error: 'Un candidato rechazado no se puede reactivar' }, 409));
      await expect(vacancyService.setApplicantStatus(ID, { kind: 'legacy', id: 'c1' }, 'seguimiento')).rejects.toThrow('no se puede reactivar');
    });

    it('sin sesión no llama a la red', async () => {
      getSession.mockResolvedValue({ data: { session: null } });
      await expect(vacancyService.applicants(ID)).rejects.toThrow('No autorizado');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('elimina por DELETE con el token', async () => {
      fetchMock.mockReturnValue(okJson({ success: true }));

      await vacancyService.delete(ID);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/vacancies/${ID}`);
      expect(init.method).toBe('DELETE');
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('propaga el 403 si quien borra no es la empresa', async () => {
      fetchMock.mockReturnValue(okJson({ error: 'No tienes permisos para esta acción sobre las vacantes' }, 403));
      await expect(vacancyService.delete(ID)).rejects.toThrow('No tienes permisos');
    });
  });
});
