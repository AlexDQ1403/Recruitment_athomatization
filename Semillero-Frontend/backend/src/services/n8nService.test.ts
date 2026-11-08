import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const cfg = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock('../config', () => ({ config: cfg }));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import * as n8n from './n8nService';

const SECRET = 'shhh-secret';
let fetchMock: ReturnType<typeof vi.fn>;

describe('n8nService', () => {
  beforeEach(() => {
    cfg.N8N_WEBHOOK_URL = 'https://n8n.test/webhook/abc';
    cfg.N8N_WEBHOOK_SECRET = SECRET;
    n8n.resetN8nThrottles();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sin N8N_WEBHOOK_URL no llama a fetch', async () => {
    cfg.N8N_WEBHOOK_URL = undefined;
    await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev', 's-1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(n8n.isN8nConfigured()).toBe(false);
  });

  it('envía X-N8N-Signature = HMAC-SHA256 del cuerpo exacto', async () => {
    await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev', 's-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://n8n.test/webhook/abc');
    const expected = crypto.createHmac('sha256', SECRET).update(init.body).digest('hex');
    expect(init.headers['X-N8N-Signature']).toBe(expected);
  });

  it('sin secreto no envía firma', async () => {
    cfg.N8N_WEBHOOK_SECRET = undefined;
    await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev', 's-1');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('X-N8N-Signature');
  });

  it('no_search_results incluye mensaje, company_id y session_id', async () => {
    await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev python', 's-1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      event: 'no_search_results',
      company_id: 'co-1',
      session_id: 's-1',
      mensaje: 'dev python',
    });
  });

  it('no repite la misma consulta de la misma empresa dentro de 10 min', async () => {
    await n8n.triggerNoSearchResults('co-1', 'u-1', 'Dev Python', 's-1');
    await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev python ', 's-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await n8n.triggerNoSearchResults('co-2', 'u-9', 'dev python', 's-3'); // otra empresa
    await n8n.triggerNoSearchResults('co-1', 'u-1', 'otra consulta', 's-4');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('devuelve true si la petición salió y false si se omitió (sin URL o repetida)', async () => {
    expect(await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev', 's-1')).toBe(true);
    expect(await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev', 's-1')).toBe(false); // ventana de 10 min
    cfg.N8N_WEBHOOK_URL = undefined;
    expect(await n8n.triggerNoSearchResults('co-1', 'u-1', 'otra', 's-1')).toBe(false);
  });

  it('search_shortage lleva la consulta, la sesión y cuántos se encontraron', async () => {
    expect(await n8n.triggerSearchShortage('co-1', 'u-1', 'dev python', 's-1', 3)).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      event: 'search_shortage',
      company_id: 'co-1',
      session_id: 's-1',
      mensaje: 'dev python',
      found_count: 3,
    });
  });

  it('search_shortage y no_search_results comparten la ventana: la misma consulta no se repite entre ellos', async () => {
    expect(await n8n.triggerNoSearchResults('co-1', 'u-1', 'dev python', 's-1')).toBe(true);
    expect(await n8n.triggerSearchShortage('co-1', 'u-1', 'dev python', 's-2', 2)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('candidate_shortage se dispara como máximo una vez por hora por empresa', async () => {
    vi.useFakeTimers();
    try {
      await n8n.triggerCandidateShortage('co-1', 5);
      await n8n.triggerCandidateShortage('co-1', 6);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await n8n.triggerCandidateShortage('co-2', 5); // otra empresa
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      await n8n.triggerCandidateShortage('co-1', 7);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
