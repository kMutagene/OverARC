import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// Browser tests use an immutable fixture workspace and never attach to the developer's live server.
const testWorkspace = resolve('tests/fixtures/viewer-workspace');

/** Runs the live ASP.NET/Vite stack against current Chromium and Firefox on isolated ports. */
export default defineConfig({
  testDir: './tests/browser',
  testIgnore: 'curation.spec.ts',
  fullyParallel: true,
  workers: 6,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: `dotnet src/OverARC.Api/bin/Debug/net10.0/OverARC.Api.dll --urls http://127.0.0.1:5081 --workspace "${testWorkspace}"`,
      url: 'http://127.0.0.1:5081/_health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: { OVERARC_API_ORIGIN: 'http://127.0.0.1:5081' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
