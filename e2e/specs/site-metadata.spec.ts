import { expect, test } from '../support/fixtures';

// HTML の記載を正解として読み戻すだけにせず、合意した公開先・文言・画像仕様と照合する。
const siteUrl = 'https://seiya-matsuoka.github.io/random-cool-color-generator/';
const imageUrl = siteUrl + 'og-image.png';
const appName = 'Random Cool Color Generator';
const description =
  'Generate cool colors, copy HEX, RGB, and HSL codes, and keep your history and favorites in this browser.';
const imageAlt = 'Random Cool Color Generator with cyan, blue, and violet color swatches.';
const localBaseUrl = 'http://127.0.0.1:4173/random-cool-color-generator/';

test('本番の静的 HTML に正式 URL・説明・共有情報・アイコン参照を含める', async ({
  request,
  page,
  baseURL,
}) => {
  // Arrange: request fixture はブラウザの route 監視とは別の通信経路になる。
  // 接続前に localhost の設定を確認し、redirect も追わず、公開 URL にはアクセスしない。
  expect(baseURL).toBe(localBaseUrl);
  const response = await request.get(localBaseUrl, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  const source = await response.text();

  // Act: 応答を切り離した文書として解析する。React 実行後の head で代用しない。
  const head = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    return {
      language: document.documentElement.lang,
      titles: Array.from(document.head.querySelectorAll('title'), (element) => element.textContent),
      charsets: Array.from(document.head.querySelectorAll('meta[charset]'), (element) =>
        element.getAttribute('charset'),
      ),
      meta: Array.from(document.head.querySelectorAll('meta'), (element) => ({
        name: element.getAttribute('name'),
        property: element.getAttribute('property'),
        content: element.getAttribute('content'),
      })),
      links: Array.from(document.head.querySelectorAll('link'), (element) => ({
        rel: element.getAttribute('rel'),
        href: element.getAttribute('href'),
        type: element.getAttribute('type'),
        sizes: element.getAttribute('sizes'),
      })),
    };
  }, source);

  // Assert: 配列で比較し、値だけでなく同じタグの重複や欠落も検出する。
  expect(head.language).toBe('en');
  expect(head.titles).toEqual([appName]);
  expect(head.charsets).toEqual(['UTF-8']);
  const expectedMeta = [
    ['name', 'viewport', 'width=device-width, initial-scale=1.0'],
    ['name', 'description', description],
    ['name', 'theme-color', '#F8FAFC'],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', appName],
    ['property', 'og:locale', 'en_US'],
    ['property', 'og:title', appName],
    ['property', 'og:description', description],
    ['property', 'og:url', siteUrl],
    ['property', 'og:image', imageUrl],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:alt', imageAlt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', appName],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', imageUrl],
    ['name', 'twitter:image:alt', imageAlt],
  ] as const;
  for (const [attribute, key, value] of expectedMeta) {
    expect(
      head.meta.filter((meta) => meta[attribute] === key).map((meta) => meta.content),
      key,
    ).toEqual([value]);
  }
  expect(head.links.filter((link) => link.rel === 'canonical')).toEqual([
    { rel: 'canonical', href: siteUrl, type: null, sizes: null },
  ]);
  expect(head.links.filter((link) => link.rel === 'icon')).toEqual([
    {
      rel: 'icon',
      href: '/random-cool-color-generator/favicon-32x32.png',
      type: 'image/png',
      sizes: '32x32',
    },
    {
      rel: 'icon',
      href: '/random-cool-color-generator/favicon.svg',
      type: 'image/svg+xml',
      sizes: 'any',
    },
  ]);
  expect(source).not.toMatch(/%[A-Z_]+%/);
  // app.open() や page.goto() を使っていないため、初回生成・保存は実行していない。
  await expect(page).toHaveURL('about:blank');
});

test('本番の SVG・PNG がサブパスで配信され、実寸と透過の仕様を満たす', async ({
  request,
  page,
  baseURL,
}) => {
  // Arrange: 公開 URL の image はパスだけを再利用し、取得先はローカル preview に固定する。
  // SVG は 64 座標の元データ、PNG は 32px と 1200×630px、OGP は不透明という採用仕様。
  expect(baseURL).toBe(localBaseUrl);
  const files = [
    { path: 'favicon.svg', type: 'image/svg+xml', width: 64, height: 64, transparent: true },
    { path: 'favicon-32x32.png', type: 'image/png', width: 32, height: 32, transparent: true },
    {
      path: new URL(imageUrl).pathname,
      type: 'image/png',
      width: 1200,
      height: 630,
      transparent: false,
    },
  ];

  for (const file of files) {
    const url = new URL(file.path, localBaseUrl);
    expect(url.origin).toBe('http://127.0.0.1:4173');
    expect(url.pathname).toMatch(/^\/random-cool-color-generator\//);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');

    // Act: Content-Type だけで成功とせず、応答の実データをブラウザの画像 decoder へ渡す。
    const response = await request.get(url.href, { maxRedirects: 0 });
    expect(response.status(), file.path).toBe(200);
    expect(response.headers()['content-type'], file.path).toContain(file.type);
    const body = await response.body();
    if (file.type === 'image/svg+xml') {
      const structure = await page.evaluate((source) => {
        const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
        const references = Array.from(xml.querySelectorAll('*')).flatMap((element) =>
          Array.from(element.attributes)
            .filter(
              (attribute) =>
                (['href', 'src'].includes(attribute.localName) &&
                  !attribute.value.startsWith('#')) ||
                /url\s*\(/i.test(attribute.value),
            )
            .map((attribute) => attribute.value),
        );
        return {
          parseError: xml.querySelector('parsererror') !== null,
          root: xml.documentElement.localName,
          namespace: xml.documentElement.namespaceURI,
          viewBox: xml.documentElement.getAttribute('viewBox'),
          activeElements: xml.querySelectorAll('script, foreignObject, image, style').length,
          references,
        };
      }, body.toString('utf8'));
      // SVG の namespace URL は識別子であり、外部素材の取得先ではない。
      expect(structure).toEqual({
        parseError: false,
        root: 'svg',
        namespace: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 64 64',
        activeElements: 0,
        references: [],
      });
    }
    const decoded = await page.evaluate(
      async (dataUrl) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Expected a 2D image context');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let transparentPixels = 0;
        let opaquePixels = 0;
        for (let offset = 3; offset < pixels.length; offset += 4) {
          if (pixels[offset] === 0) transparentPixels += 1;
          if (pixels[offset] === 255) opaquePixels += 1;
        }
        return { width: canvas.width, height: canvas.height, transparentPixels, opaquePixels };
      },
      'data:' + file.type + ';base64,' + body.toString('base64'),
    );

    // Assert: 空画像でないことと背景の扱いを確認する。色・文字・構図の見た目は別途レビューする。
    expect(decoded.width, file.path).toBe(file.width);
    expect(decoded.height, file.path).toBe(file.height);
    if (file.transparent) {
      expect(decoded.transparentPixels, file.path).toBeGreaterThan(0);
      expect(decoded.opaquePixels, file.path).toBeGreaterThan(0);
    } else {
      expect(decoded.opaquePixels, file.path).toBe(file.width * file.height);
    }
  }
});
