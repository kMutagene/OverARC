import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The development proxy keeps browser requests same-origin while allowing isolated test ports.
const apiOrigin = process.env.OVERARC_API_ORIGIN ?? 'http://127.0.0.1:5080';

/** Shared Vite build/development and Vitest/jsdom configuration for the React workbench. */
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // The backend owns this runtime state and may hold its publication lock exclusively on Windows.
    watch: { ignored: ['**/.overarc/**'] },
    warmup: { clientFiles: ['./src/web/main.tsx'] },
    proxy: { '/api': apiOrigin, '/_health': apiOrigin },
  },
  test: {
    environment: 'jsdom',
    include: ['src/web/**/*.test.{ts,tsx}', 'tests/performance/**/*.test.{ts,tsx}'],
    setupFiles: './tests/setup/frontend.ts',
  },
});
