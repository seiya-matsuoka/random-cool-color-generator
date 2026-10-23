import type { Hsl, Rgb } from './types';

function assertDigestLength(digest: ArrayBuffer): void {
  if (digest.byteLength !== 32) {
    throw new RangeError('SHA-256 digest must contain 32 bytes.');
  }
}

export function digestToHash(digest: ArrayBuffer): string {
  assertDigestLength(digest);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function digestToHsl(digest: ArrayBuffer): Hsl {
  assertDigestLength(digest);
  const view = new DataView(digest);

  // 符号とバイト順を固定し、実行環境によって色の割り当てが変わることを防ぐ。
  return {
    h: 160 + (view.getUint32(0, false) % 111),
    s: 65 + (view.getUint32(4, false) % 36),
    l: 25 + (view.getUint32(8, false) % 46),
  };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  let channels: [number, number, number];

  if (h < 60) {
    channels = [chroma, secondary, 0];
  } else if (h < 120) {
    channels = [secondary, chroma, 0];
  } else if (h < 180) {
    channels = [0, chroma, secondary];
  } else if (h < 240) {
    channels = [0, secondary, chroma];
  } else if (h < 300) {
    channels = [secondary, 0, chroma];
  } else {
    channels = [chroma, 0, secondary];
  }

  const [r, g, b] = channels;
  return {
    r: Math.round((r + offset) * 255),
    g: Math.round((g + offset) * 255),
    b: Math.round((b + offset) * 255),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return (
    '#' +
    [r, g, b]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

// 保存済みの HEX は、呼び出し側で形式を検証してから渡す。
export function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function formatRgb({ r, g, b }: Rgb): string {
  return `rgb(${r} ${g} ${b})`;
}

export function formatHsl({ h, s, l }: Hsl): string {
  return `hsl(${h} ${s}% ${l}%)`;
}
