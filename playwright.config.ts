import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: real Chromium against the static site, served from the repo root.
// Unit tests live in tests/unit/ and run on Node's built-in test runner (npm run test:unit).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // A stray test.only would silently skip the rest of the suite; fail the CI run instead.
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // On GitHub Actions, the github reporter also annotates failures inline on the PR.
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']]
    : [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:8765',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    // Keep the browser in sync with package-lock.json: `npx playwright install chromium`.
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    // Mobile viewport, also on Chromium, so no extra browser download is needed.
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 8765',
    url: 'http://localhost:8765',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
