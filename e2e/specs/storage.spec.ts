import { test, expect, current, collection, expand, ready } from '../support/fixtures';
import { known, other, envelope, keys, twenty } from '../support/records';

// 全件不正・未対応は正常な空配列と違い、通常保存を止める。両領域で同じ保護境界を確認する。
for (const kind of ['history', 'favorites'] as const) {
  for (const [name, raw] of [
    ['JSON 破損', '{'],
    ['未対応 version', envelope([], 2)],
    ['全件不正', envelope([null])],
  ] as const) {
    test.describe(`${kind}: ${name}`, () => {
      test.use({ seed: { [kind]: raw }, initialDigest: 'other' });
      test('raw を保護し、Cancel・Escape の後に対象キーだけを Reset できる', async ({
        page,
        app,
      }) => {
        // Arrange: 初回生成成功でも、保護した raw は書き換えない。
        await app.open();
        expect(await app.raw(kind)).toBe(raw);
        const label = `Reset ${kind}`;
        const trigger = page.getByRole('button', { name: label, exact: true });
        await expect(trigger).toBeEnabled();
        if (kind === 'history')
          await expect(
            page.getByRole('button', { name: 'Clear history', exact: true }),
          ).toBeDisabled();
        else
          await expect(
            current(page).getByRole('button', { name: 'Add to favorites', exact: true }),
          ).toBeDisabled();
        const otherKind = kind === 'history' ? 'favorites' : 'history';
        const untouched = await app.raw(otherKind);
        // Act + Assert: 各キャンセルを通し、対象 raw と別領域を保持する。
        for (const action of ['cancel', 'escape'] as const) {
          await trigger.click();
          const dialog = page.getByRole('dialog', { name: `${label}?` });
          await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
          if (action === 'cancel') await dialog.getByRole('button', { name: 'Cancel' }).click();
          else await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
          expect(await app.raw(kind)).toBe(raw);
        }
        await trigger.click();
        await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
        expect(await app.raw(kind)).toBeNull();
        expect(await app.raw(otherKind)).toBe(untouched);
        expect(await page.evaluate(() => window.__test.raw('other-app:sentinel'))).toBe(
          'test-only-keep',
        );
        await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
        await expect(collection(page, kind).getByRole('heading')).toContainText('(0 / 20)');
        expect(
          await page.evaluate(() =>
            window.__test.calls.filter((c) => c.api === 'removeItem').map((c) => c.argument),
          ),
        ).toEqual([keys[kind]]);
      });
    });
  }
}

test.describe('一部不正と調整', () => {
  const raw = envelope([known, null, known, ...twenty.slice(1), other]);
  test.use({ seed: { history: raw, favorites: raw }, initialDigest: 'defer' });
  test('読み込みだけでは raw を変えず、正常記録を使い両領域の案内を残す', async ({ page, app }) => {
    // Arrange: 起動時の digest を保留し、「読む」と「生成成功による保存」を分離する。
    await app.open(false);
    await expect(collection(page, 'history').getByRole('heading')).toContainText('(20 / 20)');
    await expect(collection(page, 'favorites').getByRole('heading')).toContainText('(20 / 20)');
    expect(await app.raw('history')).toBe(raw);
    expect(await app.raw('favorites')).toBe(raw);
    expect(
      await page.evaluate(() => window.__test.calls.filter((c) => c.api === 'setItem')),
    ).toEqual([]);
    // Act: 初回生成成功は正当な履歴更新。お気に入りは書き戻さない。
    await page.evaluate((hash) => window.__test.finishDigest(0, hash), other.hash);
    await ready(page);
    // Assert: 同時に存在する両方の継続案内が、通常通知で欠けない。
    await expect(
      page.getByRole('status').filter({ hasText: 'Some saved history entries' }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Some saved favorites entries' }),
    ).toBeVisible();
    expect(await app.raw('favorites')).toBe(raw);
    expect(await app.items('history')).toHaveLength(20);
    await current(page).getByRole('button', { name: 'Copy HEX' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'HEX copied.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Some saved/ })).toHaveCount(2);
  });
});

test.describe('履歴の保存失敗', () => {
  test.use({ seed: { history: envelope([known]) }, initialDigest: 'native' });
  test('書き込み失敗後はタブ内で継続し、保存再試行せずタブ内 Clear と再読み込みで復旧する', async ({
    page,
    app,
  }) => {
    // Arrange: 初回成功後の次の履歴保存だけを失敗させる。
    await app.open();
    const saved = await app.raw('history');
    await page.evaluate((key) => {
      window.__test.faults = [`setItem:${key}`];
    }, keys.history);
    // Act: 生成そのものは成功する。以後は fault を外しても同一タブ内で再試行しない。
    await app.generate('known');
    await page.evaluate(() => {
      window.__test.faults = [];
    });
    await app.generate('other');
    await expand(page, 'history');
    await expect(collection(page, 'history').getByRole('heading')).toContainText('(4 / 20)');
    expect(await app.raw('history')).toBe(saved);
    expect(
      await page.evaluate(
        () =>
          window.__test.calls.filter((c) => c.api === 'setItem' && c.state === 'rejected').length,
      ),
    ).toBe(1);
    await expect(
      page.getByRole('status').filter({ hasText: 'History could not be saved' }),
    ).toBeVisible();
    await current(page).getByRole('button', { name: 'Add to favorites', exact: true }).click();
    expect((await app.items('favorites'))[0]).toMatchObject({ hex: other.hex });
    await page.getByRole('button', { name: 'Clear history', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('this tab only');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Clear history', exact: true })
      .click();
    expect(await app.raw('history')).toBe(saved);
    await expect(collection(page, 'history').getByRole('heading')).toContainText('(0 / 20)');
    // Assert: reload は故障注入も解除された新しい document で保存モードを再評価する。
    await page.reload();
    await ready(page);
    await expect(page.getByText(/History could not be saved/)).toHaveCount(0);
    expect(await app.items('history')).toHaveLength(3);
  });

  test('Clear の削除失敗では一覧を残し、成功と案内しない', async ({ page, app }) => {
    // Arrange: 正常な一覧と、removeItem だけの故障。
    await app.open();
    const before = await app.raw('history');
    await page.evaluate((key) => {
      window.__test.faults = [`removeItem:${key}`];
    }, keys.history);
    // Act: 確認後に削除を試みる。
    await page.getByRole('button', { name: 'Clear history', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Clear history', exact: true })
      .click();
    // Assert: 永続・表示とも元を残し、領域別の保存失敗を表示する。
    expect(await app.raw('history')).toBe(before);
    await expect(collection(page, 'history').getByRole('heading')).toContainText('(2 / 20)');
    await expect(page.getByRole('status')).toContainText('History could not be saved');
    await expect(page.getByText('History cleared.', { exact: true })).toHaveCount(0);
  });
});

for (const action of ['add', 'remove'] as const) {
  test.describe(`お気に入り ${action} の保存失敗`, () => {
    test.use({
      seed: { favorites: envelope([known]) },
      initialDigest: action === 'add' ? 'other' : 'known',
    });
    test('未保存の案を反映せず操作前の一覧と別領域を維持する', async ({ page, app }) => {
      // Arrange: 最新の一覧を読めても setItem が失敗する境界。
      await app.open();
      const favorites = await app.raw('favorites');
      const history = await app.raw('history');
      await page.evaluate((key) => {
        window.__test.faults = [`setItem:${key}`];
      }, keys.favorites);
      // Act: 追加または確認付き解除。
      await current(page)
        .getByRole('button', {
          name: action === 'add' ? 'Add to favorites' : 'Remove favorite',
          exact: true,
        })
        .click();
      if (action === 'remove')
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Remove favorite', exact: true })
          .click();
      // Assert: 更新を取り消すべき保存失敗を、履歴のタブ内継続と混同しない。
      await expect(page.getByRole('status')).toContainText('Your favorites were not changed');
      expect(await app.raw('favorites')).toBe(favorites);
      expect(await app.raw('history')).toBe(history);
      await expect(
        current(page).getByRole('button', {
          name: action === 'add' ? 'Add to favorites' : 'Remove favorite',
          exact: true,
        }),
      ).toBeDisabled();
    });
  });
}

for (const kind of ['history', 'favorites'] as const) {
  test.describe(`${kind} 読み取り失敗`, () => {
    test.use({ initialFaults: [`getItem:${keys[kind]}`], initialDigest: 'other' });
    test('利用不可を破損と取り違えず、別領域と生成を継続する', async ({ page, app }) => {
      // Arrange / Act: 起動時の片方の読み取りが例外になる。
      await app.open();
      // Assert: 復旧用 Reset は表示せず、他方の正常な動作を維持する。
      await expect(page.getByRole('button', { name: `Reset ${kind}`, exact: true })).toHaveCount(0);
      await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
      if (kind === 'history') {
        await current(page).getByRole('button', { name: 'Add to favorites', exact: true }).click();
        expect(await app.items('favorites')).toHaveLength(1);
      } else expect(await app.items('history')).toHaveLength(1);
    });
  });
  test.describe(`${kind} Reset 失敗`, () => {
    test.use({ seed: { [kind]: '{' }, initialDigest: 'other' });
    test('削除例外でも保護状態と raw を維持する', async ({ page, app }) => {
      // Arrange: 保護対象の削除だけを失敗させる。
      await app.open();
      await page.evaluate((key) => {
        window.__test.faults = [`removeItem:${key}`];
      }, keys[kind]);
      // Act: 対象 Reset を確定する。
      await page.getByRole('button', { name: `Reset ${kind}`, exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: `Reset ${kind}`, exact: true })
        .click();
      // Assert: 正常モードへ遷移せず、再確認できるまま残す。
      expect(await app.raw(kind)).toBe('{');
      await expect(page.getByRole('button', { name: `Reset ${kind}`, exact: true })).toBeEnabled();
      await expect(page.getByRole('alert')).toContainText('Could not reset saved data');
    });
  });
}

test('localStorage getter の失敗でも両領域を保護し、色生成は継続する', async ({ page, app }) => {
  // Arrange: 正常起動の後、保存領域そのものを取得できなくする。
  await app.open();
  const saved = await app.raw('history');
  await page.evaluate(() => {
    window.__test.blockStorage = true;
  });
  // Act: 新規生成とお気に入り追加は、それぞれの保存例外として扱う。
  await app.generate('other');
  await current(page).getByRole('button', { name: 'Add to favorites', exact: true }).click();
  // Assert: 保存案内は 2 領域独立で残り、Reset を出さない。
  await expect(
    page.getByRole('status').filter({ hasText: /could not be saved|Could not save favorites/ }),
  ).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Reset / })).toHaveCount(0);
  expect(await app.raw('history')).toBe(saved);
});
