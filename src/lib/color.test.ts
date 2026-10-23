import { describe, expect, it } from 'vitest';
import {
  digestToHash,
  digestToHsl,
  formatHsl,
  formatRgb,
  hexToRgb,
  hslToRgb,
  rgbToHex,
} from './color';

// describe は関連するテストのまとまり、it は 1 ケース、expect は結果と期待値の比較を表す。
// 期待値を変換式から計算し直すと同じ誤りを見逃すため、技術設計の既知値をそのまま使用する。
const knownHash = '633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab';
// 16 進数の文字列を 2 文字ずつ取り出し、1 バイトずつの配列と、その実体である ArrayBuffer に戻す。
// ?? [] は match の結果が null の場合の代替値を表す。ここでは固定の 64 桁を入力している。
const knownDigest = Uint8Array.from(knownHash.match(/../g) ?? [], (byte) =>
  Number.parseInt(byte, 16),
).buffer;

/**
 * H・S・L へ割り当てる元の整数を直接指定する、変換テスト専用のダイジェストを作る。
 * 実際の SHA-256 計算は行わず、狙った境界を確実に再現するためのバイト列とする。
 */
function makeDigest(u0: number, u1: number, u2: number): ArrayBuffer {
  const digest = new ArrayBuffer(32);
  const view = new DataView(digest);
  // 読み取りの仕様と同じ big-endian で、先頭から 4 バイトずつ書き込む。残りは初期値の 0 とする。
  view.setUint32(0, u0, false);
  view.setUint32(4, u1, false);
  view.setUint32(8, u2, false);
  return digest;
}

describe('ダイジェストの変換', () => {
  it('技術設計のハッシュと HSL に一致する', () => {
    // Arrange（準備）: 共通の既知ダイジェストと、設計で確定しているハッシュ・HSL を使用する。
    // Act + Assert（実行・検証）: 文字列は toBe、オブジェクトの各値は toEqual で比較する。
    expect(digestToHash(knownDigest)).toBe(knownHash);
    expect(digestToHsl(knownDigest)).toEqual({ h: 207, s: 77, l: 50 });
  });

  it('ハッシュの先頭の 0 を残して小文字 64 桁にする', () => {
    // Arrange（準備）: 0、1 桁の 16 進数、最大の 1 バイトを混在させ、桁埋めと英字の小文字化を確かめる。
    const digest = new ArrayBuffer(32);
    new Uint8Array(digest).set([0x00, 0x0a, 0xff]);
    // Act + Assert（実行・検証）: 先頭 3 バイトと残る 29 バイトの 0 が、各 2 桁で残る。
    expect(digestToHash(digest)).toBe('000aff' + '00'.repeat(29));
  });

  // it.each は表の各行を独立したケースとして実行する。values は元の整数 3 個、expected は HSL。
  // 下限、上限、剰余が 0 へ戻る直後、符号なし 32 bit 整数の最大値を選び、範囲と符号の誤りを検出する。
  it.each([
    { values: [0, 0, 0], expected: { h: 160, s: 65, l: 25 } },
    { values: [110, 35, 45], expected: { h: 270, s: 100, l: 70 } },
    { values: [111, 36, 46], expected: { h: 160, s: 65, l: 25 } },
    {
      values: [0xffffffff, 0xffffffff, 0xffffffff],
      expected: { h: 166, s: 68, l: 36 },
    },
  ])('符号なし整数 $values を所定の色域へ割り当てる', ({ values, expected }) => {
    // Arrange（準備）: 表の 3 値を取り出す。= 0 は要素が undefined の場合の既定値で、型検査にも対応する。
    const [u0 = 0, u1 = 0, u2 = 0] = values;
    // Act + Assert（実行・検証）: 合成したバイト列を変換し、表で明示した HSL と照合する。
    expect(digestToHsl(makeDigest(u0, u1, u2))).toEqual(expected);
  });

  it('HSL には先頭 12 バイトだけを使用する', () => {
    // Arrange（準備）: 元の固定データをコピーし、HSL に使わないオフセット 12 以降だけを書き換える。
    const digest = knownDigest.slice(0);
    new Uint8Array(digest).fill(0xff, 12);
    // Act + Assert（実行・検証）: 色は変わらず、全 32 バイトを使うハッシュ文字列は変わる。
    expect(digestToHsl(digest)).toEqual({ h: 207, s: 77, l: 50 });
    expect(digestToHash(digest)).not.toBe(knownHash);
  });

  // 空、色の読み取り分だけ、必要長の直前・直後を選ぶ。%i には各行の長さが入り、失敗時に区別できる。
  it.each([0, 12, 31, 33])('32 バイト以外の %i バイトを拒否する', (length) => {
    // Arrange（準備）: 不正な長さだけを変え、内容によらず拒否されることを確かめる。
    const digest = new ArrayBuffer(length);
    // Act + Assert（実行・検証）: 関数で包んで実行を expect に委ね、同期的な例外の型を確認する。
    expect(() => digestToHash(digest)).toThrow(RangeError);
    expect(() => digestToHsl(digest)).toThrow(RangeError);
  });
});

describe('HSL / RGB / HEX の変換', () => {
  it('技術設計の HSL / RGB / HEX が一致する', () => {
    // Arrange（準備）: 技術設計の HSL と、対応する RGB・HEX の既知値を基準にする。
    // Act（実行）: 実際の変換関数で HSL から RGB を求める。
    const rgb = hslToRgb({ h: 207, s: 77, l: 50 });
    // Assert（検証）: 先に固定の RGB を確認し、その値と HEX の両方向の変換が一致することも確かめる。
    expect(rgb).toEqual({ r: 29, g: 137, b: 226 });
    expect(rgbToHex(rgb)).toBe('#1D89E2');
    expect(hexToRgb('#1D89E2')).toEqual(rgb);
  });

  // 表の h は入力の角度、rgb は計算済みの期待値。彩度 100・明度 50 に固定して色相の影響を分離する。
  // 6 区間の切り替わりに加え、生成範囲の両端 160・270 度、180・240 度の前後と丸めを確認する。
  it.each([
    { h: 0, rgb: { r: 255, g: 0, b: 0 } },
    { h: 60, rgb: { r: 255, g: 255, b: 0 } },
    { h: 120, rgb: { r: 0, g: 255, b: 0 } },
    { h: 160, rgb: { r: 0, g: 255, b: 170 } },
    { h: 179, rgb: { r: 0, g: 255, b: 251 } },
    { h: 180, rgb: { r: 0, g: 255, b: 255 } },
    { h: 181, rgb: { r: 0, g: 251, b: 255 } },
    { h: 239, rgb: { r: 0, g: 4, b: 255 } },
    { h: 240, rgb: { r: 0, g: 0, b: 255 } },
    { h: 241, rgb: { r: 4, g: 0, b: 255 } },
    { h: 270, rgb: { r: 128, g: 0, b: 255 } },
    { h: 300, rgb: { r: 255, g: 0, b: 255 } },
  ])('色相 $h 度の区間と丸めを確認する', ({ h, rgb }) => {
    // Arrange（準備）: 各行の色相と固定の彩度・明度を入力とし、表の RGB を期待値とする。
    // Act + Assert（実行・検証）: 区間選択と整数への丸めを、成分ごとの固定値で確認する。
    expect(hslToRgb({ h, s: 100, l: 50 })).toEqual(rgb);
  });

  // 彩度 0 の無彩色、明度 0 の黒、明度 100 の白を確認する。最後の行は 127.5 が 128 になる丸めの例。
  it.each([
    { hsl: { h: 207, s: 0, l: 50 }, rgb: { r: 128, g: 128, b: 128 } },
    { hsl: { h: 207, s: 100, l: 0 }, rgb: { r: 0, g: 0, b: 0 } },
    { hsl: { h: 207, s: 100, l: 100 }, rgb: { r: 255, g: 255, b: 255 } },
    { hsl: { h: 240, s: 100, l: 25 }, rgb: { r: 0, g: 0, b: 128 } },
  ])('彩度・明度の境界 $hsl を変換する', ({ hsl, rgb }) => {
    // Arrange（準備）: 表の hsl と rgb を入力・期待値の組として使用する。
    // Act + Assert（実行・検証）: 色相以外の境界でも正しい RGB の整数値になる。
    expect(hslToRgb(hsl)).toEqual(rgb);
  });

  it('HEX を 2 桁ずつ埋めて大文字で出力する', () => {
    // Arrange（準備）: 0、16 進数で 1 桁の A、最大値 FF で、桁埋めと大文字表記を同時に確認する。
    // Act + Assert（実行・検証）: 仕様の #RRGGBB 表記と、そこから復元した RGB の双方を照合する。
    expect(rgbToHex({ r: 0, g: 10, b: 255 })).toBe('#000AFF');
    expect(hexToRgb('#000AFF')).toEqual({ r: 0, g: 10, b: 255 });
  });

  it('表示用 HSL は RGB から再計算せず元の整数を使う', () => {
    // Arrange（準備）: 元の HSL と、変換後の RGB をそれぞれ直接渡す。
    // Act + Assert（実行・検証）: 空白区切り、% の位置、元の整数を含む表示・コピー用の文字列を確認する。
    expect(formatHsl({ h: 207, s: 77, l: 50 })).toBe('hsl(207 77% 50%)');
    expect(formatRgb({ r: 29, g: 137, b: 226 })).toBe('rgb(29 137 226)');
  });
});
