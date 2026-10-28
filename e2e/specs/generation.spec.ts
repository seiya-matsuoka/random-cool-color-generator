import { test, expect, current, ready, expand, collection } from '../support/fixtures';
import { fixedTime, known, keys, other } from '../support/records';

test('実 Web Crypto の初回生成が既知値に一致し、履歴は 1 件だけとなる', async ({ page, app }) => {
  // Arrange: 空の独立 context と固定時刻。digest は本物のまま使用する。
  await app.open();
  // Act: 初期表示の詳細を開く。
  await current(page).locator('summary').click();
  // Assert: 実装の変換関数を oracle にせず、技術設計の定数で全情報を照合する。
  await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
  await expect(current(page).getByText(known.hash, { exact: true })).toBeVisible();
  await expect(current(page).getByText('rgb(29 137 226)', { exact: true })).toBeVisible();
  await expect(current(page).getByText('hsl(207 77% 50%)', { exact: true })).toBeVisible();
  await expect(current(page).locator('time')).toHaveText('2026-10-19 00:00:00.000 UTC+09:00');
  expect(await app.items('history')).toEqual([
    expect.objectContaining({ ...known, id: expect.any(String) }),
  ]);
  expect(
    await page.evaluate(() =>
      window.__test.calls
        .filter((c) => c.api === 'digest' || c.api === 'setItem')
        .map((c) => [c.api, c.argument]),
    ),
  ).toEqual([
    ['digest', `rccg:v1:${fixedTime}:1:0`],
    ['setItem', keys.history],
  ]);
});

test('保留中の再生成は旧色と開閉状態を維持し、連打を 1 要求だけにする', async ({ page, app }) => {
  // Arrange: 再生成の digest だけを保留し、無効化中の画面を観察可能にする。
  await app.open();
  await expand(page, 'history');
  await current(page).locator('summary').click();
  await page.evaluate(() => {
    window.__test.digestMode = 'defer';
  });
  // Act: 実際のダブルクリック。2 回目の click を再有効化まで待って実行しない。
  await page.getByRole('button', { name: 'Generate color', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Generating...', exact: true })).toBeDisabled();
  await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
  await expect(current(page).getByRole('button', { name: 'Copy HEX' })).toBeEnabled();
  await expect(
    current(page).getByRole('button', { name: 'Add to favorites', exact: true }),
  ).toBeDisabled();
  await expect(
    collection(page, 'history').getByRole('button', { name: /^Show color/ }),
  ).toBeDisabled();
  // Assert: 旧色と違う固定 digest を完了し、連番 2 の追加だけを確認する。
  await page.evaluate((hash) => window.__test.finishDigest(1, hash), other.hash);
  await ready(page);
  expect((await app.items('history')).map((r) => r.sequence)).toEqual([2, 1]);
  await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
  await expect(current(page).locator('details')).toHaveAttribute('open', '');
  await expect(collection(page, 'history').locator('details')).toHaveAttribute('open', '');
});

test('再読み込みは保存済み履歴へ新しい初回 1 件を追加し、連番を 1 に戻す', async ({
  page,
  app,
}) => {
  // Arrange: 再読み込み前のデータを保持する。init script で再 seed しない。
  await app.open();
  const before = (await app.items('history'))[0]!;
  await page.clock.setFixedTime(new Date(fixedTime + 1000));
  // Act: 本物の reload を行う。
  await page.reload();
  await ready(page);
  // Assert: 元の記録全体を残し、新しい記録だけを先頭に置く。
  const items = await app.items('history');
  expect(items).toHaveLength(2);
  expect(items[1]).toEqual(before);
  expect(items[0]).toMatchObject({ generatedAt: fixedTime + 1000, sequence: 1 });
  expect(items[0]!.id).not.toBe(before.id);
});

test('生成 API の拒否と 8 候補衝突では現在色・履歴を保持する', async ({ page, app }) => {
  // Arrange: 正常な初回記録を退避する。
  await app.open();
  const before = await app.raw('history');
  // Act + Assert: API 失敗は 1 回で打ち切り、同じ色は候補 8 回で打ち切る。
  await app.generate('reject');
  await expect(page.getByRole('alert')).toContainText('Could not generate a color');
  expect(await app.raw('history')).toBe(before);
  await app.generate('known');
  await expect(page.getByRole('alert')).toContainText('Could not generate a color');
  expect(await app.raw('history')).toBe(before);
  await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
  const seeds = await page.evaluate(() =>
    window.__test.calls.filter((c) => c.api === 'digest').map((c) => c.argument),
  );
  expect(seeds).toEqual([
    `rccg:v1:${fixedTime}:1:0`,
    `rccg:v1:${fixedTime}:2:0`,
    ...Array.from({ length: 8 }, (_, attempt) => `rccg:v1:${fixedTime}:3:${attempt}`),
  ]);
});

test.describe('初回生成に失敗した場合', () => {
  test.use({ initialDigest: 'reject' });
  test('色なしと再実行手段を表示し、再試行の成功だけを履歴へ追加する', async ({ page, app }) => {
    // Arrange: 初回 API だけが失敗する独立 context。
    await app.open();
    await expect(current(page).getByText('No color to display yet.')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Could not generate');
    expect(await app.raw('history')).toBeNull();
    // Act: 成功する固定値に切り替えて再試行。
    await app.generate('known');
    // Assert: 失敗も連番を消費するが、履歴へ追加しない。
    expect(await app.items('history')).toEqual([
      expect.objectContaining({ sequence: 2, hex: known.hex }),
    ]);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
