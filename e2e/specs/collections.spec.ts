import { test, expect, current, collection, expand } from '../support/fixtures';
import { known, other, duplicate, twenty, envelope } from '../support/records';

test.describe('記録の再表示とお気に入り', () => {
  test.use({ seed: { history: envelope([duplicate, known]) }, initialDigest: 'other' });
  test('再表示は元の日時・詳細を保持し、履歴・連番・開閉状態を変えない', async ({ page, app }) => {
    // Arrange: 同じ HEX でも ID と日時が異なる 2 記録。
    await app.open();
    const before = await app.raw('history');
    await expand(page, 'history');
    await current(page).locator('summary').click();
    // Act: 生成せず古い記録を選ぶ。
    await collection(page, 'history')
      .getByRole('button', { name: `Show color ${duplicate.hex}, record 3`, exact: true })
      .click();
    // Assert: 元の詳細と .007 を表示する。表示時刻への付け替えや再計算をしない。
    await expect(current(page).locator('time')).toHaveText('2026-10-19 00:00:00.007 UTC+09:00');
    await expect(current(page).getByText(known.hash, { exact: true })).toBeVisible();
    expect(await app.raw('history')).toBe(before);
    expect(
      await page.evaluate(() => window.__test.calls.filter((c) => c.api === 'digest').length),
    ).toBe(1);
    await expect(collection(page, 'favorites').locator('details')).not.toHaveAttribute('open', '');
    await app.generate('other');
    expect((await app.items('history'))[0]).toMatchObject({ sequence: 2, hex: other.hex });
  });

  test('同じ HEX の別記録でも最初に登録したスナップショットを保持する', async ({ page, app }) => {
    // Arrange: 履歴から元の known を登録する。
    await app.open();
    await expand(page, 'history');
    await collection(page, 'history')
      .getByRole('button', { name: `Add to favorites ${known.hex}, record 1`, exact: true })
      .click();
    const saved = await app.raw('favorites');
    // Act: 同じ色の別記録をメインへ表示し、登録済みの連動を観察する。
    await collection(page, 'history')
      .getByRole('button', { name: `Show color ${duplicate.hex}, record 3`, exact: true })
      .click();
    // Assert: 二重追加の UI はなく、保存済み元記録も変わらない。
    await expect(
      current(page).getByRole('button', { name: 'Remove favorite', exact: true }),
    ).toBeEnabled();
    await expect(
      collection(page, 'history').getByRole('button', { name: /^Remove favorite #1D89E2/ }),
    ).toHaveCount(2);
    expect(await app.raw('favorites')).toBe(saved);
    expect(await app.items('favorites')).toEqual([known]);
    await expand(page, 'favorites');
    await collection(page, 'favorites')
      .getByRole('button', { name: `Show color ${known.hex}, record 1`, exact: true })
      .click();
    await expect(current(page).locator('time')).toHaveText('2026-10-19 00:00:00.000 UTC+09:00');
  });
});

test.describe('上限', () => {
  test.use({
    seed: { history: envelope(twenty), favorites: envelope(twenty) },
    initialDigest: 'other',
  });
  test('履歴は最新 20 件で最古だけを除外し、お気に入り満杯では新規追加を止める', async ({
    page,
    app,
  }) => {
    // Arrange: 履歴・お気に入りは独立した 20 色の一覧。
    await app.open();
    // Assert: 固定の残存順を照合し、実装と同じ slice から期待値を作らない。
    expect((await app.items('history')).map((r) => r.sequence)).toEqual([
      1, 1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    ]);
    expect(await app.items('favorites')).toEqual(twenty);
    await expect(
      current(page).getByRole('button', { name: 'Add to favorites', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('Favorites are full. Remove a color to add another.', { exact: true }),
    ).toBeVisible();
    // Act: 満杯でも登録済み色は解除でき、新しい現在色を登録できる。
    await expand(page, 'favorites');
    await collection(page, 'favorites')
      .getByRole('button', { name: `Remove favorite ${known.hex}, record 1`, exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove favorite', exact: true })
      .click();
    await current(page).getByRole('button', { name: 'Add to favorites', exact: true }).click();
    // Assert: 他の 19 色を自動削除せず、最初の新規記録を先頭へ保存する。
    const favorites = await app.items('favorites');
    expect(favorites).toHaveLength(20);
    expect(favorites[0]).toMatchObject({ hex: other.hex, sequence: 1 });
    expect(favorites.slice(1)).toEqual(twenty.slice(1));
  });
});

test.describe('履歴上限の直前', () => {
  test.use({ seed: { history: envelope(twenty.slice(0, 19)) }, initialDigest: 'other' });
  test('19 件から 20 件では最古を保持し、同じ HEX の別記録も残す', async ({ page, app }) => {
    // Arrange / Act: 初回の新規 1 件を追加し、切り捨てがまだ不要な境界を調べる。
    await app.open();
    const items = await app.items('history');
    // Assert: 20 件目では元の末尾を残す。以降の同色生成でも ID が異なれば履歴に追加する。
    expect(items).toHaveLength(20);
    expect(items.at(-1)).toEqual(twenty[18]);
    await app.generate('known');
    expect((await app.items('history')).filter((r) => r.hex === known.hex)).toHaveLength(2);
    await expect(collection(page, 'history').getByRole('heading')).toContainText('(20 / 20)');
  });
});

test.describe('お気に入りの再読み込み', () => {
  test.use({ seed: { favorites: envelope([known]) } });
  test('再読み込み後も元のスナップショットを再表示できる', async ({ page, app }) => {
    // Arrange: 履歴と独立した記録を保存済みとする。
    await app.open();
    // Act: document を作り直し、保存された favorite を選択する。
    await page.reload();
    await expect(page.getByRole('button', { name: 'Generate color', exact: true })).toBeEnabled();
    await expand(page, 'favorites');
    const history = await app.raw('history');
    await collection(page, 'favorites')
      .getByRole('button', { name: /^Show color/ })
      .click();
    // Assert: 元の日時・記録を使い、選択のための生成や履歴変更は行わない。
    expect(await app.items('favorites')).toEqual([known]);
    expect(await app.raw('history')).toBe(history);
    await expect(current(page).locator('time')).toHaveText('2026-10-19 00:00:00.000 UTC+09:00');
  });
});

test.describe('確認と独立性', () => {
  test.use({
    seed: { history: envelope([known]), favorites: envelope([known]) },
    initialDigest: 'other',
  });
  test('履歴 Clear の Cancel・Escape と確定を区別し、現在色とお気に入りを残す', async ({
    page,
    app,
  }) => {
    // Arrange: 現在色は別の色、お気に入りには元の記録を保存済み。
    await app.open();
    const before = await app.raw('history');
    const trigger = page.getByRole('button', { name: 'Clear history', exact: true });
    // Act + Assert: 両方のキャンセル経路では保存内容を変えず起点へ戻す。
    for (const cancel of ['button', 'escape'] as const) {
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Clear history?' });
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      if (cancel === 'button') await dialog.getByRole('button', { name: 'Cancel' }).click();
      else await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      expect(await app.raw('history')).toBe(before);
    }
    await trigger.click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Clear history', exact: true })
      .click();
    expect(await app.raw('history')).toBeNull();
    expect(await app.items('favorites')).toEqual([known]);
    await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
    await expect(collection(page, 'history').getByRole('heading')).toBeFocused();
    await expand(page, 'favorites');
    await collection(page, 'favorites')
      .getByRole('button', { name: /^Show color/ })
      .click();
    await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
    expect(await app.raw('history')).toBeNull();
  });

  test('解除の Cancel・Escape は無変更、確定後は消えた起点の代わりに見出しへ戻る', async ({
    page,
    app,
  }) => {
    // Arrange: 現在色も解除対象にして、一覧削除から表示記録を分離していることを確認する。
    await app.open();
    await expand(page, 'favorites');
    const region = collection(page, 'favorites');
    await region.getByRole('button', { name: /^Show color/ }).click();
    const history = await app.raw('history');
    const trigger = region.getByRole('button', { name: /^Remove favorite/ });
    // Act + Assert: 確認内容が対象 HEX を示し、キャンセルでは保持する。
    for (const cancel of ['button', 'escape'] as const) {
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Remove favorite?' });
      await expect(dialog.getByText(known.hex, { exact: true })).toBeVisible();
      if (cancel === 'button') await dialog.getByRole('button', { name: 'Cancel' }).click();
      else await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      expect(await app.items('favorites')).toEqual([known]);
    }
    await trigger.click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove favorite', exact: true })
      .click();
    await expect(region.getByRole('heading')).toBeFocused();
    expect(await app.items('favorites')).toEqual([]);
    expect(await app.raw('history')).toBe(history);
    await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
  });
});
