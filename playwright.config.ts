import { defineConfig } from '@playwright/test';

/** 本番 dist の利用フローを検証する。開発時の Strict Mode は別設定で扱う。 */
export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results/production',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/production', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/random-cool-color-generator/',
    browserName: 'chromium',
    locale: 'en-US',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { viewport: { width: 1280, height: 900 } } },
    {
      name: 'chromium-mobile',
      // Chromium の幅・入力設定であり、スマートフォン実機や別 engine の保証ではない。
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173/random-cool-color-generator/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
