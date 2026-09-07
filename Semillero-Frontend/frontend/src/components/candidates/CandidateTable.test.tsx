import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mocks necesarios para el componente
vi.mock('../../services/candidateService', () => ({
  candidateService: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 15, totalPages: 0 }),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ toasts: [], success: vi.fn(), error: vi.fn(), remove: vi.fn() }),
}));

vi.mock('../ui/Toast', () => ({
  ToastContainer: () => null,
}));

vi.mock('../ui/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

import { CandidateTable } from './CandidateTable';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('CandidateTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra skeleton mientras carga', () => {
    render(<CandidateTable />, { wrapper });
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renderiza sin errores con lista vacía', async () => {
    render(<CandidateTable />, { wrapper });
    expect(document.querySelector('.candidate-table-wrapper')).toBeTruthy();
  });

  it('muestra empty state cuando no hay candidatos', async () => {
    const { candidateService } = await import('../../services/candidateService');
    vi.mocked(candidateService.list).mockResolvedValue({ items: [], total: 0, page: 1, limit: 15, totalPages: 0 });

    const { findByText } = render(<CandidateTable />, { wrapper });
    expect(await findByText(/No hay candidatos con los filtros aplicados/)).toBeTruthy();
  });

  it('muestra botón de exportar CSV deshabilitado sin datos', () => {
    render(<CandidateTable />, { wrapper });
    const csvBtn = screen.getByText('↓ CSV');
    expect(csvBtn).toBeDisabled();
  });
});
