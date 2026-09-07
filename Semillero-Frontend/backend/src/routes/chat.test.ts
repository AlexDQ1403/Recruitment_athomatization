import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock config antes de importar el router
vi.mock('../config', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    OPENAI_API_KEY: 'sk-test',
    CORS_ORIGIN: 'http://localhost:3002',
    PORT: 3001,
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
  },
}));

// Mock supabase
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

// Mock logger para silenciar output en tests
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../utils/tracing', () => ({
  correlationMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getCorrelationId: () => 'test-correlation-id',
}));

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const { default: chatRouter } = await import('./chat');
  app.use('/api/chat', chatRouter);
  return app;
};

describe('POST /api/chat', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Por defecto Supabase devuelve usuario autenticado
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    // Por defecto from() devuelve cadena fluida vacía
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [] }), insert: vi.fn().mockResolvedValue({ error: null }), in: vi.fn().mockResolvedValue({ data: [] }) };
    mockFrom.mockReturnValue(chain);
    app = await buildApp();
  });

  it('devuelve 401 sin Authorization header', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'hola' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No autorizado');
  });

  it('devuelve 401 con token inválido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-malo')
      .send({ message: 'hola' });
    expect(res.status).toBe(401);
  });

  it('devuelve 400 con mensaje vacío', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-valido')
      .send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Mensaje vacío');
  });

  it('devuelve 400 con mensaje demasiado largo', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-valido')
      .send({ message: 'a'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/demasiado largo/);
  });

  it('responde 200 con mensaje válido usando fallback por palabras clave', async () => {
    // Simular fallo de OpenAI para activar el fallback keyword
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const candidateChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'c1', full_name: 'Ana García', position: 'Desarrolladora React', location: 'Bogotá', experience_years: 3, expected_salary: 4000000, source: 'internal', status: 'pending' }] }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      in: vi.fn().mockResolvedValue({ data: [] }),
    };
    mockFrom.mockReturnValue(candidateChain);

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-valido')
      .send({ message: 'Busco desarrolladora React' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.message).toBe('string');
  });

  it('no incluye email ni teléfono en la respuesta del chat', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const candidateChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'c1', full_name: 'Juan Pérez', position: 'Backend', email: 'juan@privado.com', phone: '3001234567', location: 'Medellín', experience_years: 5, source: 'internal', status: 'pending' }] }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      in: vi.fn().mockResolvedValue({ data: [] }),
    };
    mockFrom.mockReturnValue(candidateChain);

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-valido')
      .send({ message: 'backend medellín' });

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('juan@privado.com');
    expect(body).not.toContain('3001234567');
  });
});
