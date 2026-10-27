import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, current, expand, collection } from '../support/fixtures';
import { known, other, keys } from '../support/records';

test('本番の生成・選択・コピー・保存・削除は通信や URL に記録を載せない', async ({
  context,
  page,
  app,
  baseURL,
}) => {
  // Arrange: 初回 document より前から通信を記録する。外部への試行は共通 fixture でも失敗にする。
  const requests: { url: string; method: string; body: string | null }[] = [];
  context.on('request', (request) =>
    requests.push({ url: request.url(), method: request.method(), body: request.postData() }),
  );
  await app.open();
  const initial = requests.length;
  // Act: 通常操作の連鎖を本番画面で行う。
  await current(page).getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await app.generate('other');
  await expand(page, 'favorites');
  await collection(page, 'favorites')
    .getByRole('button', { name: /^Show color/ })
    .click();
  await current(page).getByRole('button', { name: 'Copy HEX' }).click();
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Clear history', exact: true })
    .click();
  await collection(page, 'favorites')
    .getByRole('button', { name: /^Remove favorite/ })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove favorite', exact: true })
    .click();
  // Assert: 操作で追加 request は発生しない。配信物取得の GET と生成記録の送信を区別する。
  expect(requests.slice(initial)).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin).toBe(new URL(baseURL!).origin);
    expect(url.search).toBe('');
    expect(request.method).toBe('GET');
    expect(request.body).toBeNull();
    expect(request.url).not.toContain(known.hash);
    expect(request.url).not.toContain(other.hex);
  }
  await expect(page).toHaveURL(baseURL!);
  expect(
    await page.evaluate(() =>
      window.__test.calls
        .filter((c) => ['getItem', 'setItem', 'removeItem'].includes(c.api))
        .map((c) => c.argument),
    ),
  ).toEqual(expect.arrayContaining([keys.history, keys.favorites]));
  expect(
    await page.evaluate(() =>
      window.__test.calls
        .filter((c) => ['getItem', 'setItem', 'removeItem'].includes(c.api))
        .every((c) =>
          ['random-cool-color-generator:history', 'random-cool-color-generator:favorites'].includes(
            c.argument,
          ),
        ),
    ),
  ).toBe(true);
});

test('実行時ソースと配信物に外部 CDN・送信処理・テスト harness を混ぜない', async () => {
  // Arrange: 読み取り対象はこのリポジトリの runtime ソースと build 済み dist だけ。
  const root = resolve(import.meta.dirname, '../..');
  const sourceRoot = resolve(root, 'src');
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const sources = entries.filter(
    (entry) =>
      entry.isFile() &&
      /\.(ts|tsx|css)$/.test(entry.name) &&
      !/\.(test|stories)\./.test(entry.name) &&
      entry.name !== 'story-fixtures.ts',
  );
  // Act / Assert: 実行する通信 API・外部参照と全消去の追加を検出する。
  for (const entry of sources) {
    const text = await readFile(resolve(entry.parentPath, entry.name), 'utf8');
    expect(text, entry.name).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(|new\s+(?:WebSocket|EventSource)|https?:\/\/|localStorage\.clear\s*\(/,
    );
  }
  const html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  expect(html).toContain('/random-cool-color-generator/assets/');
  expect(html).not.toMatch(/(?:src|href)=["']https?:/);
  const assets = await readdir(resolve(root, 'dist/assets'));
  for (const asset of assets.filter((name) => /\.(js|css)$/.test(name))) {
    const text = await readFile(resolve(root, 'dist/assets', asset), 'utf8');
    expect(text).not.toMatch(/__test|__lifecycle|Lifecycle test harness/);
    if (asset.endsWith('.css')) expect(text).not.toMatch(/(?:url\(|@import\s+)["']?https?:/);
  }
});
