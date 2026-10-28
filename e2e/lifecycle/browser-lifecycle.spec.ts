import { test, expect, current, ready } from '../support/fixtures';
import { known, other, keys } from '../support/records';

test('開発 Strict Mode の effect 再実行でも初回生成と履歴保存は 1 回だけ', async ({
  page,
  app,
}) => {
  // Arrange / Act: 本番 E2E と異なり、開発 bundle の実 React root を使用する。
  await page.goto('e2e/harness/');
  await ready(page);
  // Assert: effect の再実行が起きた根拠と、その中での副作用 1 回を別々に確認する。
  expect(await page.evaluate(() => window.__lifecycle.events)).toEqual([
    'setup',
    'cleanup',
    'setup',
  ]);
  expect(
    await page.evaluate(() => window.__test.calls.filter((c) => c.api === 'digest').length),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.__test.calls.filter((c) => c.api === 'uuid').length),
  ).toBe(1);
  expect(
    await page.evaluate(() =>
      window.__test.calls.filter((c) => c.api === 'setItem').map((c) => c.argument),
    ),
  ).toEqual([keys.history]);
  expect(await app.items('history')).toHaveLength(1);
  await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
});

test('同じ callback の同期的な二重呼び出しでも生成要求を 1 回だけ受け付ける', async ({
  page,
  app,
}) => {
  // Arrange: DOM の disabled が更新される前の再入を意図的に再現する。
  await page.goto('e2e/harness/');
  await ready(page);
  await page.evaluate(() => {
    window.__test.digestMode = 'defer';
    window.__lifecycle.generateTwice();
  });
  await expect(page.getByRole('button', { name: 'Generating...', exact: true })).toBeDisabled();
  // Act: 保留している唯一の要求を成功させる。
  await page.evaluate((hash) => window.__test.finishDigest(1, hash), other.hash);
  await ready(page);
  // Assert: state の描画より先に ref の busy が二重実行を防ぐ。
  expect((await app.items('history')).map((r) => r.sequence)).toEqual([2, 1]);
  expect(
    await page.evaluate(() => window.__test.calls.filter((c) => c.api === 'digest').length),
  ).toBe(2);
});

test.describe('初回生成の unmount', () => {
  test.use({ initialDigest: 'defer' });
  test('古い起動処理を完了しても保存せず、storage の購読も解除する', async ({ page, app }) => {
    // Arrange: Strict Mode の再購読後も初回 Promise を保留する。
    await page.goto('e2e/harness/');
    await expect
      .poll(() => page.evaluate(() => window.__test.calls.filter((c) => c.api === 'digest').length))
      .toBe(1);
    // Act: React の正式な cleanup の後で旧生成を完了させる。
    await page.getByRole('button', { name: 'Unmount app', exact: true }).click();
    const commits = await page.evaluate(() => window.__lifecycle.commits.length);
    await page.evaluate((hash) => window.__test.finishDigest(0, hash), known.hash);
    // Assert: 計算を中断したとは扱わず、保存・描画への反映を止める。
    expect(await app.raw('history')).toBeNull();
    expect(await page.evaluate(() => window.__lifecycle.commits.length)).toBe(commits);
    const calls = await page.evaluate(() => window.__test.calls.length);
    await page.evaluate(() => {
      dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
      return window.__test.drain();
    });
    expect(await page.evaluate(() => window.__test.calls.length)).toBe(calls);
  });
});

test('再生成を保留したまま unmount すると、旧履歴を保持し追加保存しない', async ({ page, app }) => {
  // Arrange: 初回は確定済みで、次の処理だけを保留する。
  await page.goto('e2e/harness/');
  await ready(page);
  const saved = await app.raw('history');
  await page.evaluate(() => {
    window.__test.digestMode = 'defer';
  });
  await page.getByRole('button', { name: 'Generate color', exact: true }).click();
  // Act: unmount 後に再生成を成功させる。
  await page.getByRole('button', { name: 'Unmount app', exact: true }).click();
  await page.evaluate((hash) => window.__test.finishDigest(1, hash), other.hash);
  // Assert: 古い要求の保存は行わない。
  expect(await app.raw('history')).toBe(saved);
  await expect(page.getByRole('region', { name: 'Current color', exact: true })).toHaveCount(0);
});

for (const success of [true, false]) {
  test(`unmount 後の旧コピー${success ? '成功' : '失敗'}を新しい mount へ反映しない`, async ({
    page,
  }) => {
    // Arrange: 旧 root のコピーだけを保留する。
    await page.goto('e2e/harness/');
    await ready(page);
    await page.evaluate(() => {
      window.__test.copyMode = 'defer';
    });
    await current(page).getByRole('button', { name: 'Copy HEX' }).click();
    // Act: unmount → API 完了 → 別 root の mount の順を制御する。
    await page.getByRole('button', { name: 'Unmount app', exact: true }).click();
    const commits = await page.evaluate(() => window.__lifecycle.commits.length);
    await page.evaluate((value) => window.__test.finishCopy(0, value), success);
    expect(await page.evaluate(() => window.__lifecycle.commits.length)).toBe(commits);
    await page.evaluate(() => {
      window.__test.digestMode = 'other';
    });
    await page.getByRole('button', { name: 'Mount app', exact: true }).click();
    await ready(page);
    // Assert: 新しい表示へ旧通知を引き継がず、拒否も未処理例外にしない。
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => window.__test.calls.find((c) => c.api === 'copy')?.state),
    ).toBe(success ? 'resolved' : 'rejected');
  });
}

test('同じ確認 callback を二重に呼んでも対象削除を一度だけ実行する', async ({ page, app }) => {
  // Arrange: 確認済みの操作を同期的に消費できるかを DOM イベントから分離して調べる。
  await page.goto('e2e/harness/');
  await ready(page);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  // Act: 同じ確認 callback を 2 回呼ぶ。
  await page.evaluate(() => window.__lifecycle.confirmTwice());
  // Assert: 2 回目は pending 消費済みで、同じ removeItem を再実行しない。
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await app.raw('history')).toBeNull();
  expect(
    await page.evaluate(() => window.__test.calls.filter((c) => c.api === 'removeItem').length),
  ).toBe(1);
});
