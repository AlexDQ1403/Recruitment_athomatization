import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase antes de importar el service
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockIlike = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();

const chain = () => {
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    ilike: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
  };
  return c;
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => chain()),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

import { candidateService } from './candidateService';

describe('candidateService.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve estructura paginada vacía cuando no hay candidatos', async () => {
    const result = await candidateService.list(1, 15, {});
    expect(result).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 0,
    });
  });

  it('calcula totalPages correctamente', async () => {
    const { supabase } = await import('../lib/supabase');
    const c = chain();
    c.range.mockResolvedValue({
      data: Array.from({ length: 15 }, (_, i) => ({ id: `${i}`, full_name: `C${i}`, position: 'Dev', status: 'pending', source: 'internal', created_at: '', updated_at: '' })),
      error: null,
      count: 32,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockReturnValue(c as any);

    const result = await candidateService.list(1, 15, {});
    expect(result.total).toBe(32);
    expect(result.totalPages).toBe(3);
  });
});

describe('candidateService.getStatsByStatus', () => {
  it('agrupa correctamente por status', async () => {
    const { supabase } = await import('../lib/supabase');
    const c = chain();
    c.select.mockResolvedValue({
      data: [
        { status: 'pending' }, { status: 'pending' },
        { status: 'hired' },
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockReturnValue(c as any);

    const stats = await candidateService.getStatsByStatus();
    expect(stats.pending).toBe(2);
    expect(stats.hired).toBe(1);
    expect(stats.interviewed).toBeUndefined();
  });
});
