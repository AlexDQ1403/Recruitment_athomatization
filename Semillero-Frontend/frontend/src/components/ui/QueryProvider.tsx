'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
      mutations: { retry: 0 },
    },
  });

/**
 * Acepta un cliente externo para que quien monte el provider pueda vaciar la
 * caché al cerrar sesión. Sin prop, crea el suyo.
 */
export const QueryProvider = ({
  children,
  client,
}: {
  children: React.ReactNode;
  client?: QueryClient;
}) => {
  const [fallback] = useState(createQueryClient);
  return <QueryClientProvider client={client ?? fallback}>{children}</QueryClientProvider>;
};
