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

const knownHash = '633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab';
const knownDigest = Uint8Array.from(knownHash.match(/../g) ?? [], (byte) =>
  Number.parseInt(byte, 16),
).buffer;

function makeDigest(u0: number, u1: number, u2: number): ArrayBuffer {
  const digest = new ArrayBuffer(32);
  const view = new DataView(digest);
  view.setUint32(0, u0, false);
  view.setUint32(4, u1, false);
  view.setUint32(8, u2, false);
  return digest;
}

describe('ダイジェストの変換', () => {
  it('技術設計のハッシュと HSL に一致する', () => {
    expect(digestToHash(knownDigest)).toBe(knownHash);
    expect(digestToHsl(knownDigest)).toEqual({ h: 207, s: 77, l: 50 });
  });

  it('ハッシュの先頭の 0 を残して小文字 64 桁にする', () => {
    const digest = new ArrayBuffer(32);
    new Uint8Array(digest).set([0x00, 0x0a, 0xff]);
    expect(digestToHash(digest)).toBe('000aff' + '00'.repeat(29));
  });

  it.each([
    { values: [0, 0, 0], expected: { h: 160, s: 65, l: 25 } },
    { values: [110, 35, 45], expected: { h: 270, s: 100, l: 70 } },
    { values: [111, 36, 46], expected: { h: 160, s: 65, l: 25 } },
    {
      values: [0xffffffff, 0xffffffff, 0xffffffff],
      expected: { h: 166, s: 68, l: 36 },
    },
  ])('符号なし整数 $values を所定の色域へ割り当てる', ({ values, expected }) => {
    const [u0 = 0, u1 = 0, u2 = 0] = values;
    expect(digestToHsl(makeDigest(u0, u1, u2))).toEqual(expected);
  });

  it('HSL には先頭 12 バイトだけを使用する', () => {
    const digest = knownDigest.slice(0);
    new Uint8Array(digest).fill(0xff, 12);
    expect(digestToHsl(digest)).toEqual({ h: 207, s: 77, l: 50 });
    expect(digestToHash(digest)).not.toBe(knownHash);
  });

  it.each([0, 12, 31, 33])('32 バイト以外の %i バイトを拒否する', (length) => {
    const digest = new ArrayBuffer(length);
    expect(() => digestToHash(digest)).toThrow(RangeError);
    expect(() => digestToHsl(digest)).toThrow(RangeError);
  });
});

describe('HSL / RGB / HEX の変換', () => {
  it('技術設計の HSL / RGB / HEX が一致する', () => {
    const rgb = hslToRgb({ h: 207, s: 77, l: 50 });
    expect(rgb).toEqual({ r: 29, g: 137, b: 226 });
    expect(rgbToHex(rgb)).toBe('#1D89E2');
    expect(hexToRgb('#1D89E2')).toEqual(rgb);
  });

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
    expect(hslToRgb({ h, s: 100, l: 50 })).toEqual(rgb);
  });

  it.each([
    { hsl: { h: 207, s: 0, l: 50 }, rgb: { r: 128, g: 128, b: 128 } },
    { hsl: { h: 207, s: 100, l: 0 }, rgb: { r: 0, g: 0, b: 0 } },
    { hsl: { h: 207, s: 100, l: 100 }, rgb: { r: 255, g: 255, b: 255 } },
    { hsl: { h: 240, s: 100, l: 25 }, rgb: { r: 0, g: 0, b: 128 } },
  ])('彩度・明度の境界 $hsl を変換する', ({ hsl, rgb }) => {
    expect(hslToRgb(hsl)).toEqual(rgb);
  });

  it('HEX を 2 桁ずつ埋めて大文字で出力する', () => {
    expect(rgbToHex({ r: 0, g: 10, b: 255 })).toBe('#000AFF');
    expect(hexToRgb('#000AFF')).toEqual({ r: 0, g: 10, b: 255 });
  });

  it('表示用 HSL は RGB から再計算せず元の整数を使う', () => {
    expect(formatHsl({ h: 207, s: 77, l: 50 })).toBe('hsl(207 77% 50%)');
    expect(formatRgb({ r: 29, g: 137, b: 226 })).toBe('rgb(29 137 226)');
  });
});
