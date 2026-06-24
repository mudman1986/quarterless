import { defineConfig, devices } from '@playwright/test';

// Playwright boots the production build via `vite preview` and runs the smoke
// tests against it. This verifies the exact artifact that will be deployed to
// GitHub Pages actually loads in a real browser.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker: the specs each boot a full headless Phaser game, and running
  // several WebGL instances at once starves the frame loop enough to make the
  // stateful timing assertions flaky. Serial keeps them deterministic (this is
  // already the CI behaviour) and the suite is small.
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }]]
    : [
        ['list'],
        ['html', { open: 'never' }],
      ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/playwright-web-server.mjs',
    url: 'http://127.0.0.1:4173/quarterless/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
