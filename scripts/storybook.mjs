import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows の cmd と CI の Bash で環境変数の構文が異なるため、Node の標準機能で渡す。
// この入口は dev / build 専用であり、初期化・AI / MCP・公開コマンドは実行しない。
const args = process.argv.slice(2);
if (args[0] !== 'dev' && args[0] !== 'build') {
  throw new Error('Use this script with dev or build.');
}

const require = createRequire(import.meta.url);
const packagePath = require.resolve('storybook/package.json');
const packageInfo = JSON.parse(readFileSync(packagePath, 'utf8'));
// 固定バージョンの公開 bin を使い、内部 API の import や npx による暗黙の取得を避ける。
if (typeof packageInfo.bin !== 'string') throw new Error('Expected the Storybook CLI bin path.');
const cliPath = resolve(dirname(packagePath), packageInfo.bin);
const childEnv = { ...process.env, STORYBOOK_DISABLE_TELEMETRY: 'true' };
delete childEnv.STORYBOOK_ENABLE_CRASH_REPORTS;

// env は子の最初の命令より前に設定されるため、main.ts を読む前のイベントも抑止できる。
const result = spawnSync(process.execPath, [cliPath, ...args], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: childEnv,
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
// build 失敗を npm と CI に伝え、子プロセスが異常終了した場合も成功扱いにしない。
process.exitCode = result.status ?? 1;
