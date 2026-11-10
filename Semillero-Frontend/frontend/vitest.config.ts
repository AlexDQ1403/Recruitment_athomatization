import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Las pruebas que escriben con userEvent pasan de 5 s cuando la suite corre en paralelo
    testTimeout: 15000,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/app/layout.tsx', 'src/app/page.tsx'],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
