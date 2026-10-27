import { defineConfig } from '@playwright/test';

/** React の開発 bundle で effect 再実行と実際の unmount を検証する補助 runner。 */
export default defineConfig({
  testDir: './e2e/lifecycle',
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results/lifecycle',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/lifecycle', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173/random-cool-color-generator/',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium-lifecycle' }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173/random-cool-color-generator/e2e/harness/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
