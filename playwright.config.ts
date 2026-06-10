import { defineConfig, devices } from '@playwright/test';

// Playwright boots the production build via `vite preview` and runs the smoke
// tests against it. This verifies the exact artifact that will be deployed to
// GitHub Pages actually loads in a real browser.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173/sindicate/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
