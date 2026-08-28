import { defineConfig, devices } from '@playwright/test';
import { curationWorkspace } from './tests/browser/curationWorkspace';

/** Runs the mutating curation slice serially against an isolated temporary native workspace. */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'curation.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  globalSetup: './tests/browser/curation.setup.ts',
  globalTeardown: './tests/browser/curation.teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: `dotnet src/OverARC.Api/bin/Debug/net10.0/OverARC.Api.dll --urls http://127.0.0.1:5082 --workspace "${curationWorkspace}"`,
      url: 'http://127.0.0.1:5082/_health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --port 5175 --strictPort',
      url: 'http://127.0.0.1:5175',
      env: { OVERARC_API_ORIGIN: 'http://127.0.0.1:5082' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
