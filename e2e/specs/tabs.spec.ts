import { test, expect, current, collection, expand, ready } from '../support/fixtures';
import { fixedTime, keys, known, other, envelope } from '../support/records';
import type { Page } from '@playwright/test';

const shown = (page: Page) => current(page).locator('code').first().textContent();

test('実 storage イベントで両一覧を同期し、各ページの色・開閉状態・連番を保つ', async ({
  context,
  page,
  baseURL,
  app,
}) => {
  // Arrange: context は共有するが、アプリの表示状態は各ページが保持する。
  await app.open();
  await expand(page, 'history');
  await expand(page, 'favorites');
  await current(page).locator('summary').click();
  const firstColor = await shown(page);
  const second = await context.newPage();
  await second.clock.setFixedTime(new Date(fixedTime + 1000));
  await second.goto(baseURL!);
  await ready(second);
  const secondColor = await shown(second);
  await expect(collection(page, 'history').getByRole('heading')).toContainText('(2 / 20)');
  // Act: 別ページの通常 UI から登録・削除・解除する。合成イベントで同期を代用しない。
  await current(second).getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await expect(collection(page, 'favorites').getByRole('heading')).toContainText('(1 / 20)');
  await second.getByRole('button', { name: 'Clear history', exact: true }).click();
  await second
    .getByRole('dialog')
    .getByRole('button', { name: 'Clear history', exact: true })
    .click();
  await expect(collection(page, 'history').getByRole('heading')).toContainText('(0 / 20)');
  await current(second).getByRole('button', { name: 'Remove favorite', exact: true }).click();
  await second
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove favorite', exact: true })
    .click();
  await expect(collection(page, 'favorites').getByRole('heading')).toContainText('(0 / 20)');
  // Assert: 一覧同期で現在色も details も連番も更新しない。
  expect(await shown(page)).toBe(firstColor);
  expect(await shown(second)).toBe(secondColor);
  await expect(current(page).locator('details')).toHaveAttribute('open', '');
  await expect(collection(page, 'history').locator('details')).toHaveAttribute('open', '');
  await expect(collection(page, 'favorites').locator('details')).toHaveAttribute('open', '');
  await app.generate('other');
  expect((await app.items('history')).map((r) => r.sequence)).toEqual([2]);
  await expect(collection(second, 'history').getByRole('heading')).toContainText('(1 / 20)');
  expect(await shown(second)).toBe(secondColor);
});

test.describe('確認中の対象消失', () => {
  test.use({ seed: { favorites: envelope([known]) } });
  test('他ページで解除済みの色を再作成せず、最新状態の結果を通知する', async ({
    context,
    page,
    baseURL,
    app,
  }) => {
    // Arrange: ページ A は古い対象を確認中。
    await app.open();
    await expand(page, 'favorites');
    await collection(page, 'favorites')
      .getByRole('button', { name: /^Remove favorite/ })
      .click();
    const second = await context.newPage();
    await second.clock.setFixedTime(new Date(fixedTime + 1000));
    await second.goto(baseURL!);
    await ready(second);
    await expand(second, 'favorites');
    // Act: ページ B の確定で消し、その後 A も確定する。
    await collection(second, 'favorites')
      .getByRole('button', { name: /^Remove favorite/ })
      .click();
    await second
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove favorite', exact: true })
      .click();
    await expect(collection(page, 'favorites').getByRole('heading')).toContainText('(0 / 20)');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove favorite', exact: true })
      .click();
    // Assert: A の古い配列へ操作を適用して上書きしない。
    expect(await app.items('favorites')).toEqual([]);
    await expect(page.getByRole('status')).toContainText('already removed');
    await expect(collection(page, 'favorites').getByRole('heading')).toBeFocused();
  });
});

for (const kind of ['history', 'favorites'] as const) {
  for (const [name, replacement] of [
    ['正常化', envelope([known])],
    ['削除', null],
    ['別の破損', '{changed'],
  ] as const) {
    test.describe(`${kind} Reset 確認中の${name}`, () => {
      test.use({ seed: { [kind]: '{' } });
      test('確認済み raw と違う最新データの削除を中止する', async ({
        context,
        page,
        baseURL,
        app,
      }) => {
        // Arrange: protected のページでは storage イベントによる自動復帰もしない。
        await app.open();
        await page.getByRole('button', { name: `Reset ${kind}`, exact: true }).click();
        const second = await context.newPage();
        await second.clock.setFixedTime(new Date(fixedTime + 1000));
        await second.goto(baseURL!);
        await ready(second);
        // Act: 同一 origin の別ページが対象キーだけを更新する。
        await second.evaluate(
          ({ key, value }) => {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          },
          { key: keys[kind], value: replacement },
        );
        await page
          .getByRole('dialog')
          .getByRole('button', { name: `Reset ${kind}`, exact: true })
          .click();
        // Assert: 正常化・削除・別破損のすべてで、古い同意を新しい raw へ拡張しない。
        expect(await app.raw(kind)).toBe(replacement);
        await expect(page.getByRole('alert')).toContainText('Nothing was reset. Reload');
        await expect(
          page.getByRole('button', { name: `Reset ${kind}`, exact: true }),
        ).toBeEnabled();
        expect(
          await page.evaluate(() => window.__test.calls.filter((c) => c.api === 'removeItem')),
        ).toEqual([]);
      });
    });
  }
}

test('他キー・sessionStorage を無視し、key=null でも専用 2 キーだけを読む', async ({
  page,
  app,
}) => {
  // Arrange: 同じページの保存変更では storage イベントが届かないため、UI は元のまま。
  await app.open();
  const original = await shown(page);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: keys.history,
    value: envelope([other]),
  });
  const start = await page.evaluate(() => window.__test.calls.length);
  // Act: 対象外イベントは明示的に合成する。全消去 API は使用しない。
  await page.evaluate((key) => {
    dispatchEvent(
      new StorageEvent('storage', { key: 'other-app:sentinel', storageArea: localStorage }),
    );
    dispatchEvent(new StorageEvent('storage', { key, storageArea: sessionStorage }));
    return window.__test.drain();
  }, keys.history);
  expect(await page.evaluate((index) => window.__test.calls.slice(index), start)).toEqual([]);
  await page.evaluate(() => {
    dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    return window.__test.drain();
  });
  // Assert: null は専用キーを再評価する通知であり、キー列挙や全消去の許可ではない。
  expect(
    await page.evaluate(
      (index) => window.__test.calls.slice(index).map((c) => [c.api, c.argument]),
      start,
    ),
  ).toEqual([
    ['getItem', keys.history],
    ['getItem', keys.favorites],
  ]);
  expect(await shown(page)).toBe(original);
  await expect(collection(page, 'history').getByRole('heading')).toContainText('(1 / 20)');
});

test('他タブから破損を受け取ると保護し、後の正常値でも自動復帰しない', async ({
  context,
  page,
  baseURL,
  app,
}) => {
  // Arrange: 両ページは最初は正常保存中。
  await app.open();
  const original = await shown(page);
  const second = await context.newPage();
  await second.clock.setFixedTime(new Date(fixedTime + 1000));
  await second.goto(baseURL!);
  await ready(second);
  // Act: 実 storage イベントで破損を受け取り、その後正常化する。
  await second.evaluate((key) => localStorage.setItem(key, '{'), keys.history);
  await expect(page.getByRole('button', { name: 'Reset history', exact: true })).toBeEnabled();
  await second.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: keys.history,
    value: envelope([known]),
  });
  await app.generate('other');
  // Assert: protected のタブは新規履歴を保存せず、別タブが書いた正常 raw を維持する。
  expect(await app.raw('history')).toBe(envelope([known]));
  await expect(page.getByRole('button', { name: 'Reset history', exact: true })).toBeEnabled();
  expect(original).toBe(known.hex);
  await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
});
