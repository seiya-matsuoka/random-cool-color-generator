import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, current, collection, expand } from '../support/fixtures';
import { twenty, envelope, known } from '../support/records';

/** 既定の有効ルールを使う。検出を消すための exclude・違反 baseline は作らない。 */
async function scan(page: Page, info: TestInfo) {
  const result = await new AxeBuilder({ page }).analyze();
  // incomplete は自動判定できない項目であり、違反ゼロを手動確認済みと読み替えない。
  const path = info.outputPath(`axe-${info.attachments.length}.json`);
  await writeFile(
    path,
    JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2),
  );
  await info.attach('axe-results', { path, contentType: 'application/json' });
  expect(result.violations).toEqual([]);
}

test('初回生成完了の基本画面を axe で検査する', async ({ page, app }, info) => {
  // Arrange / Act: 初期状態の閉じた一覧と詳細を含む本番画面。
  await app.open();
  // Assert: 自動で検出できる代表状態の違反を確認する。
  await scan(page, info);
});

test.describe('一覧・上限・詳細', () => {
  test.use({
    seed: { history: envelope(twenty), favorites: envelope(twenty) },
    initialDigest: 'other',
  });
  test('詳細と 20 件の一覧を開き、長い値・上限表示を axe と幅の検査で確認する', async ({
    page,
    app,
  }, info) => {
    // Arrange: 長い hash と両方の上限の状態を同時に表示する。
    await app.open();
    await current(page).locator('summary').click();
    await expand(page, 'history');
    await expand(page, 'favorites');
    // Act / Assert: 全体の自動検査と、目視用画像を別々の証跡にする。
    await scan(page, info);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('full-state.png'), fullPage: true });
    // 320 px は追加の狭幅確認。実機や別の browser project としては数えない。
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('narrow-320.png') });
  });
});

for (const kind of ['history', 'favorites'] as const) {
  test.describe(`${kind} の保護と Reset`, () => {
    test.use({ seed: { [kind]: '{' }, initialDigest: 'other' });
    test('領域別継続案内と Reset ダイアログを axe で検査する', async ({ page, app }, info) => {
      // Arrange: 他方の正常機能を維持した保護状態。
      await app.open();
      await scan(page, info);
      // Act: 明示した対象だけを Reset する確認画面。
      await page.getByRole('button', { name: `Reset ${kind}`, exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeFocused();
      // Assert: 背景が inert になる modal の状態を検査する。
      await scan(page, info);
    });
  });
}

test.describe('初回生成の保留', () => {
  test.use({ initialDigest: 'defer' });
  test('色なし・生成中の状態を検査する', async ({ page, app }, info) => {
    // Arrange / Act: 時間経過に頼らず、API を保留して初回状態を固定する。
    await app.open(false);
    await expect(current(page).getByText('No color to display yet.')).toBeVisible();
    // Assert: 処理中でも操作名や画面構造が欠けない。
    await scan(page, info);
  });
});

test('生成失敗と再生成中の旧色を axe で検査する', async ({ page, app }, info) => {
  // Arrange: 表示済みの色がある状態で失敗を注入する。
  await app.open();
  await app.generate('reject');
  await expect(page.getByRole('alert')).toBeVisible();
  await scan(page, info);
  // Act / Assert: 次の要求を保留し、旧色と閲覧可能な詳細を検査する。
  await page.evaluate(() => {
    window.__test.digestMode = 'defer';
  });
  await page.getByRole('button', { name: 'Generate color', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generating...', exact: true })).toBeDisabled();
  await scan(page, info);
});

test.describe('保存不可', () => {
  test.use({
    initialFaults: [
      'getItem:random-cool-color-generator:history',
      'getItem:random-cool-color-generator:favorites',
    ],
  });
  test('両領域の継続案内を検査する', async ({ page, app }, info) => {
    // Arrange / Act: 利用不可を破損の Reset と混同しない状態。
    await app.open();
    // Assert: 別々の案内を含む代表状態。
    await scan(page, info);
  });
});

test.describe('確認のキーボード操作', () => {
  test.use({ seed: { favorites: envelope([known]) } });
  for (const operation of ['Clear history', 'Remove favorite'] as const) {
    test(`${operation} の focus・Tab・Escape・背景クリックと axe`, async ({ page, app }, info) => {
      // Arrange: タブ順・フォーカスは axe とは別の操作検証。
      await app.open();
      let trigger = page.getByRole('button', { name: 'Clear history', exact: true });
      if (operation === 'Remove favorite') {
        await expand(page, 'favorites');
        trigger = collection(page, 'favorites').getByRole('button', { name: /^Remove favorite/ });
      }
      const before = await app.raw(operation === 'Clear history' ? 'history' : 'favorites');
      // Act: Enter で開き、Tab / Shift+Tab の移動と折り返しを確認する。
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      const cancel = dialog.getByRole('button', { name: 'Cancel' });
      const confirm = dialog.getByRole('button', { name: operation, exact: true });
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(confirm).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      // native dialog の境界ではブラウザ自身の UI へ移る場合がある。
      // document の外なら次の逆 Tab で戻す。背景の操作へ流れた場合は以下の検査が失敗する。
      if (!(await page.evaluate(() => document.hasFocus()))) await page.keyboard.press('Shift+Tab');
      await expect(confirm).toBeFocused();
      await scan(page, info);
      await page.mouse.click(2, 2);
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      // Assert: キャンセル後は元の起点に戻り、保存内容を変えない。
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      expect(await app.raw(operation === 'Clear history' ? 'history' : 'favorites')).toBe(before);
    });
  }
});
