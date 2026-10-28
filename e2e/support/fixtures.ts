import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installControls } from './browser-controls';
import type { DigestMode } from './browser-controls';
import { fixedTime, keys, known } from './records';
import type { RegionName } from './records';
import type { ColorRecord } from '../../src/lib/types';

type Options = {
  seed: Partial<Record<RegionName, string>>;
  initialDigest: DigestMode;
  initialFaults: string[];
};
type App = {
  open: (wait?: boolean) => Promise<void>;
  raw: (kind: RegionName) => Promise<string | null>;
  items: (kind: RegionName) => Promise<ColorRecord[]>;
  generate: (mode?: DigestMode) => Promise<void>;
};
export const current = (page: Page) =>
  page.getByRole('region', { name: 'Current color', exact: true });
export const collection = (page: Page, kind: RegionName) =>
  page.getByRole('region', {
    name: new RegExp(`^${kind === 'history' ? 'History' : 'Favorites'} \\(`),
  });
export async function ready(page: Page) {
  await expect(page.getByRole('button', { name: 'Generate color', exact: true })).toBeEnabled();
}
export async function expand(page: Page, kind: RegionName) {
  const details = collection(page, kind).locator('details');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}

/** context は Playwright の標準 fixture に任せ、テストごとに非永続の保存領域を作る。 */
export const test = base.extend<Options & { app: App; guard: void }>({
  seed: [{}, { option: true }],
  initialDigest: ['native', { option: true }],
  initialFaults: [[], { option: true }],
  storageState: async ({ seed, baseURL }, use) => {
    if (!baseURL) throw new Error('Expected a local baseURL');
    await use({
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            // 他アプリの値は利用者の実データではなく、ここで作る固定 sentinel だけ。
            { name: 'other-app:sentinel', value: 'test-only-keep' },
            ...Object.entries(seed).map(([kind, value]) => ({
              name: keys[kind as RegionName],
              value,
            })),
          ],
        },
      ],
    });
  },
  guard: [
    async ({ context, page, baseURL, initialDigest, initialFaults }, use, testInfo) => {
      const errors: string[] = [];
      const origin = new URL(baseURL!).origin;
      const observe = (target: Page) => {
        target.on('pageerror', (error) => errors.push(error.message));
        target.on('websocket', (socket) => {
          if (new URL(socket.url()).host !== new URL(origin).host)
            errors.push(`External socket ${socket.url()}`);
        });
      };
      context.pages().forEach(observe);
      context.on('page', observe);
      // 外部通信は遮断し、試み自体も失敗として記録する。生成記録は外へ送らない。
      await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin !== origin) {
          errors.push(`External request ${route.request().url()}`);
          await route.abort();
        } else await route.continue();
      });
      await context.addInitScript(installControls, {
        origin,
        initialDigest,
        initialFaults,
        knownHash: known.hash,
      });
      await page.clock.setFixedTime(new Date(fixedTime));
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        // ページがまだ存在する場合の、合成データに限った診断情報。
        const calls = await page.evaluate(() => window.__test?.calls).catch(() => []);
        await testInfo.attach('api-order', {
          body: JSON.stringify(calls, null, 2),
          contentType: 'application/json',
        });
      }
      expect(errors, '外部通信の試行と未処理の browser 例外').toEqual([]);
    },
    { auto: true },
  ],
  app: async ({ page }, use) => {
    const raw = (kind: RegionName) => page.evaluate((key) => window.__test.raw(key), keys[kind]);
    await use({
      async open(wait = true) {
        await page.goto('./');
        if (wait) await ready(page);
      },
      raw,
      async items(kind) {
        const value = await raw(kind);
        // 本体の実行時検証の代用ではない。正常なケースのテスト専用出力を照合する helper。
        return value === null ? [] : (JSON.parse(value) as { items: ColorRecord[] }).items;
      },
      async generate(mode = 'native') {
        await page.evaluate((value) => {
          window.__test.digestMode = value;
        }, mode);
        await page.getByRole('button', { name: 'Generate color', exact: true }).click();
        await ready(page);
      },
    });
  },
});
export { expect };
