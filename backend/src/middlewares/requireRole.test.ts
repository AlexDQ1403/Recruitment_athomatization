import { describe, it, expect, vi } from 'vitest';
import { requireRole, requireCompany } from './requireRole';
import { AuthenticatedRequest } from './companyAuth';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function buildReq(role?: string, companyId?: string): AuthenticatedRequest {
  return {
    locals: {
      user: { id: 'user-1', email: 'user@test.com' },
      profile: role ? { id: 'user-1', role, company_id: companyId } : undefined,
      companyId,
    },
  } as unknown as AuthenticatedRequest;
}

function buildRes() {
  const res: { statusCode?: number; body?: unknown } = {};
  return {
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return { json: vi.fn((body: unknown) => { res.body = body; }) };
    }),
    get statusCode() { return res.statusCode; },
    get body() { return res.body; },
  } as unknown as { status: ReturnType<typeof vi.fn>; statusCode?: number; body?: unknown };
}

describe('requireRole', () => {
  it('rechaza con 401 si no hay perfil resuelto', () => {
    const req = buildReq(undefined);
    const res = buildRes();
    const next = vi.fn();
    requireRole('recruiter')(req, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rechaza con 403 a empresa cuando la ruta es solo recruiter (chat)', () => {
    const req = buildReq('empresa', 'company-1');
    const res = buildRes();
    const next = vi.fn();
    requireRole('recruiter')(req, res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite a recruiter cuando la ruta es solo recruiter (chat)', () => {
    const req = buildReq('recruiter', 'company-1');
    const res = buildRes();
    const next = vi.fn();
    requireRole('recruiter')(req, res as never, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('permite a empresa en rutas que la incluyen explícitamente', () => {
    const req = buildReq('empresa', 'company-1');
    const res = buildRes();
    const next = vi.fn();
    requireRole('empresa')(req, res as never, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireCompany', () => {
  it('rechaza con 403 si el usuario no tiene empresa asociada', () => {
    const req = buildReq('candidato', undefined);
    const res = buildRes();
    const next = vi.fn();
    requireCompany(req, res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite continuar si hay companyId', () => {
    const req = buildReq('recruiter', 'company-1');
    const res = buildRes();
    const next = vi.fn();
    requireCompany(req, res as never, next);
    expect(next).toHaveBeenCalled();
  });
});
