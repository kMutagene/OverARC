import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const testWorkspace = resolve('tests/fixtures/viewer-workspace');

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
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
      command: `dotnet run --project src/OverARC.Api/OverARC.Api.csproj --no-build -- --urls http://127.0.0.1:5081 --workspace "${testWorkspace}"`,
      url: 'http://127.0.0.1:5081/_health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: { OVERARC_API_ORIGIN: 'http://127.0.0.1:5081' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
