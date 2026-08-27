import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    warmup: { clientFiles: ['./src/web/main.tsx'] },
    proxy: { '/api': 'http://127.0.0.1:5080', '/_health': 'http://127.0.0.1:5080' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/web/**/*.test.{ts,tsx}'],
    setupFiles: './src/web/test/setup.ts',
  },
});
