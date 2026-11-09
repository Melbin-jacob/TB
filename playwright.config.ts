import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/**
 * End-to-end tests against the production build.
 * DEMO_AS_OF pins the plan date to the mock flyer week so results stay deterministic.
 * First run on a new machine: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run build && npm start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { DEMO_AS_OF: '2026-11-09' },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
