import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:8765',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  snapshotPathTemplate: 'tests/snapshots/{projectName}-{testName}-{arg}{ext}',
  projects: [
    // Desktop Chrome is the canonical snapshot browser used in CI (Ubuntu).
    // Always use `npx playwright install chromium` to keep the binary in sync with package-lock.json.
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    // Mobile viewport — also runs on Chromium so no extra browser download needed in CI.
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
    reuseExistingServer: true,
    timeout: 10000,
  },
});
