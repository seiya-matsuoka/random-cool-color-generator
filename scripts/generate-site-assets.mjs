import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 管理対象の SVG から配信用 PNG を再生成する、ローカル専用の入口。
 * node scripts/generate-site-assets.mjs で明示的に実行する。
 * 通常の build・CI では承認した PNG をそのまま使い、OS のフォント差を公開へ持ち込まない。
 */
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = resolve(root, 'node_modules/.cache/playwright-tmp');
await mkdir(temporary, { recursive: true });
// Playwright の import 前に、取得済みブラウザと workspace 内の専用一時領域を指定する。
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
process.env.TEMP = temporary;
process.env.TMP = temporary;
process.env.TMPDIR = temporary;
const { chromium } = await import('@playwright/test');
const jobs = [
  {
    source: 'public/favicon.svg',
    output: 'public/favicon-32x32.png',
    width: 32,
    height: 32,
    transparent: true,
  },
  {
    source: 'assets/site/og-image.svg',
    output: 'public/og-image.png',
    width: 1200,
    height: 630,
    transparent: false,
  },
];
const rendered = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const job of jobs) {
    const source = await readFile(resolve(root, job.source), 'utf8');
    // 永続 profile を使わず、アプリ・保存 hook・実データから独立して SVG だけを描画する。
    const context = await browser.newContext({
      viewport: { width: job.width, height: job.height },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      offline: true,
    });
    try {
      let requestedResource = false;
      await context.route('**/*', async (route) => {
        requestedResource = true;
        await route.abort();
      });
      const page = await context.newPage();
      // HTML の自動補正で SVG の誤記を隠さないよう、挿入前に XML として検査する。
      // evaluate 内の globalThis はブラウザ側であり、この Node プロセスとは別の環境になる。
      const valid = await page.evaluate((svg) => {
        const xml = new globalThis.DOMParser().parseFromString(svg, 'image/svg+xml');
        return (
          !xml.querySelector('parsererror') &&
          xml.documentElement.localName === 'svg' &&
          !xml.querySelector('script, foreignObject')
        );
      }, source);
      if (!valid) throw new Error('Expected a valid, self-contained SVG: ' + job.source);
      await page.setContent(
        '<style>html,body{margin:0;background:transparent}body>svg{display:block;width:100vw;height:100vh}</style>' +
          source,
      );
      // 外部フォントは取得しない。ローカルで選ばれたフォントの準備が終わってから出力する。
      await page.evaluate(async () => {
        await globalThis.document.fonts.ready;
      });
      const buffer = await page.screenshot({
        type: 'png',
        omitBackground: job.transparent,
        scale: 'css',
      });
      if (requestedResource) throw new Error('SVG must not request resources: ' + job.source);
      rendered.push({ output: job.output, buffer });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
// 全素材の描画成功後に書き込む。片方の描画失敗だけで既存の PNG を更新しない。
await mkdir(resolve(root, 'public'), { recursive: true });
for (const { output, buffer } of rendered) {
  await writeFile(resolve(root, output), buffer);
  console.log('Created ' + output + ' (' + buffer.length + ' bytes)');
}
