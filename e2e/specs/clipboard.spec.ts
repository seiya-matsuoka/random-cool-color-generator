import { test, expect, current, collection, expand, ready } from '../support/fixtures';
import { other, known, envelope } from '../support/records';

const copyNotice = (page: Parameters<typeof current>[0]) =>
  page
    .getByRole('status')
    .filter({ hasText: /copied\./ })
    .or(page.getByRole('alert').filter({ hasText: 'Could not copy.' }));

test('記録を維持している通常コピーは各コードの成功と失敗を通知する', async ({ page, app }) => {
  // Arrange: clipboard だけを mock にし、保存・生成に影響しないことも照合する。
  await app.open();
  const history = await app.raw('history');
  await current(page).locator('summary').click();
  // Act + Assert: 入力値・形式ごとの通知。失敗時も選択可能な文字列を残す。
  for (const [format, text] of [
    ['HEX', known.hex],
    ['RGB', 'rgb(29 137 226)'],
    ['HSL', 'hsl(207 77% 50%)'],
  ] as const) {
    await current(page)
      .getByRole('button', { name: `Copy ${format}`, exact: true })
      .click();
    await expect(copyNotice(page)).toContainText(`${format} copied.`);
    expect(
      await page.evaluate(
        () => window.__test.calls.filter((c) => c.api === 'copy').at(-1)?.argument,
      ),
    ).toBe(text);
  }
  await page.evaluate(() => {
    window.__test.copyMode = 'reject';
  });
  await current(page).getByRole('button', { name: 'Copy HEX' }).click();
  await expect(page.getByRole('alert')).toContainText('Select the code and copy it manually.');
  expect(await app.raw('history')).toBe(history);
  expect(await app.raw('favorites')).toBeNull();
  await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
});

for (const order of ['generation-first', 'copy-first', 'late-copy-failure'] as const) {
  test(`生成中に開始した旧色コピー: ${order}`, async ({ page, app }) => {
    // Arrange: 初回だけは実 digest。次の生成と旧記録コピーを別々の Promise で保留する。
    await app.open();
    await page.evaluate(() => {
      window.__test.digestMode = 'defer';
      window.__test.copyMode = 'defer';
    });
    await page.getByRole('button', { name: 'Generate color', exact: true }).click();
    await current(page).getByRole('button', { name: 'Copy HEX' }).click();
    // Act: 完了順を明示する。固定時間待機により順序を推測しない。
    if (order === 'copy-first') {
      await page.evaluate(() => window.__test.finishCopy(0));
      await expect(copyNotice(page)).toContainText('HEX copied.');
    }
    await page.evaluate((hash) => window.__test.finishDigest(1, hash), other.hash);
    await ready(page);
    if (order !== 'copy-first')
      await page.evaluate(
        (success) => window.__test.finishCopy(0, success),
        order !== 'late-copy-failure',
      );
    // Assert: 生成成功時に表示済み通知も保留中通知も無効になる。生成中のコピーは禁止しない。
    await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
    await expect(copyNotice(page)).toHaveCount(0);
    expect((await app.items('history')).map((r) => r.sequence)).toEqual([2, 1]);
  });
}

test('生成開始前に保留したコピーは、まだ旧色を表示していても反映しない', async ({ page, app }) => {
  // Arrange: 生成要求よりも前に開始したコピーを保留する。
  await app.open();
  await page.evaluate(() => {
    window.__test.copyMode = 'defer';
    window.__test.digestMode = 'defer';
  });
  await current(page).getByRole('button', { name: 'Copy HEX' }).click();
  // Act: 新しい生成を開始してから、旧要求を先に成功させる。
  await page.getByRole('button', { name: 'Generate color', exact: true }).click();
  await page.evaluate(() => window.__test.finishCopy(0));
  // Assert: 生成開始による通知無効化と、生成成功による無効化は別々に必要。
  await expect(copyNotice(page)).toHaveCount(0);
  await expect(current(page).getByText(known.hex, { exact: true })).toBeVisible();
  await page.evaluate((hash) => window.__test.finishDigest(1, hash), other.hash);
  await ready(page);
  await expect(copyNotice(page)).toHaveCount(0);
});

test.describe('一覧選択で無効になるコピー', () => {
  test.use({ seed: { history: envelope([other]) } });
  for (const success of [true, false]) {
    test(`選択前の完了を通知しない: ${success ? '成功' : '失敗'}`, async ({ page, app }) => {
      // Arrange: 保存済み記録とは違う現在色のコピーを保留。
      await app.open();
      await expand(page, 'history');
      await page.evaluate(() => {
        window.__test.copyMode = 'defer';
      });
      await current(page).getByRole('button', { name: 'Copy HEX' }).click();
      // Act: 元の記録を選択してから、以前のコピーを完了する。
      await collection(page, 'history')
        .getByRole('button', { name: `Show color ${other.hex}, record 2`, exact: true })
        .click();
      await page.evaluate((value) => window.__test.finishCopy(0, value), success);
      // Assert: 選択後の新しい表示へ、旧記録の結果を紐付けない。
      await expect(current(page).getByText(other.hex, { exact: true })).toBeVisible();
      await expect(copyNotice(page)).toHaveCount(0);
    });
  }
});

test('連続コピーは最後の要求の通知を保持し、古い失敗で置き換えない', async ({ page, app }) => {
  // Arrange: 同じ記録の異なる形式を、通知の識別が必要な順序でコピーする。
  await app.open();
  await current(page).locator('summary').click();
  await page.evaluate(() => {
    window.__test.copyMode = 'defer';
  });
  await current(page).getByRole('button', { name: 'Copy HEX' }).click();
  await current(page).getByRole('button', { name: 'Copy RGB' }).click();
  // Act: 新しい要求を先に成功させ、その後で古い要求を失敗させる。
  await page.evaluate(() => window.__test.finishCopy(1));
  await page.evaluate(() => window.__test.finishCopy(0, false));
  // Assert: 現在の記録が同じでも、古い要求で最新通知を上書きしない。
  await expect(copyNotice(page)).toContainText('RGB copied.');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('実 Clipboard API はこのテストが書いた固定値だけを読み戻す', async ({
  context,
  page,
  app,
}) => {
  // Arrange: 独立 context に権限を与える。既存 clipboard は読まず、まず書き込みを成功させる。
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await app.open();
  await page.evaluate(() => {
    window.__test.copyMode = 'native';
  });
  // Act: 実 writeText による成功通知を確認してから、書いた値だけを照合する。
  await current(page).getByRole('button', { name: 'Copy HEX' }).click();
  await expect(copyNotice(page)).toContainText('HEX copied.');
  // Assert: mock の成功とは区別する。読み戻しは上の成功後だけに限定する。
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(known.hex);
});
