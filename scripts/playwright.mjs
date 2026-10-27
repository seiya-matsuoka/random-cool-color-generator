import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 導入済み CLI だけを使い、npx による暗黙のネットワーク取得を避ける。
// 単独の本番 E2E / UI mode は先に npm run build を実行する。
// dist の存在確認は鮮度を保証しない。verify は必ず直前に build する。
const args = process.argv.slice(2);
if (!['install', 'test', 'show-report'].includes(args[0])) {
  throw new Error('Use install, test, or show-report.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
if (
  args[0] === 'test' &&
  !args.includes('playwright.lifecycle.config.ts') &&
  !existsSync(resolve(root, 'dist/index.html'))
) {
  throw new Error('Run npm run build before standalone E2E or UI mode.');
}
const temporary = resolve(root, 'node_modules/.cache/playwright-tmp');
mkdirSync(temporary, { recursive: true });
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), ...args], {
  cwd: root,
  // 0 は公式の hermetic install。取得時と実行時の保存先を必ず一致させる。
  // OS 一時領域の代わりに、専用 profile・取得途中のファイルも workspace 内へ置く。
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: '0',
    TEMP: temporary,
    TMP: temporary,
    TMPDIR: temporary,
  },
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
