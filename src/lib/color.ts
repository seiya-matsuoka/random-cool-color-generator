// import type は型検査にだけ使う参照であり、実行時に読み込む処理には残らない。
import type { Hsl, Rgb } from './types';

/**
 * SHA-256 の出力長である 256 bit = 32 byte を、変換前の共通条件として検証する。
 * 長さだけの検証であり、内容が実際に SHA-256 から得られたかは判定しない。
 */
function assertDigestLength(digest: ArrayBuffer): void {
  if (digest.byteLength !== 32) {
    throw new RangeError('SHA-256 digest must contain 32 bytes.');
  }
}

/**
 * ダイジェスト全体を、生成情報として保持する小文字 64 桁のハッシュ文字列に変換する。
 * @param digest - SHA-256 の出力に相当する 32 バイトのバイナリデータ。
 * @throws RangeError - データ長が 32 バイトではない場合。
 */
export function digestToHash(digest: ArrayBuffer): string {
  assertDigestLength(digest);
  // ArrayBuffer はバイト列の領域であり、Uint8Array を介して 1 バイトずつ読み取る。
  // 0〜15 も必ず 2 桁に埋め、先頭の 0 やバイトの区切りに相当する桁数を失わないようにする。
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * ダイジェストの先頭 12 バイトを、仕様で定めた寒色の HSL 整数値へ割り当てる。
 * 残り 20 バイトは色の割り当てには使わず、ハッシュ文字列には全 32 バイトを残す。
 * @throws RangeError - データ長が 32 バイトではない場合。
 */
export function digestToHsl(digest: ArrayBuffer): Hsl {
  assertDigestLength(digest);
  const view = new DataView(digest);

  // DataView で 4 バイトずつ符号なし 32 bit 整数として読む。
  // 第 2 引数の false は big-endian（上位バイトが先頭）であり、環境に依存しない読み順となる。
  // 「最小値 + 整数 % 候補数」で両端を含む範囲へ収めるため、候補数は最大値 - 最小値 + 1 とする。
  return {
    h: 160 + (view.getUint32(0, false) % 111),
    s: 65 + (view.getUint32(4, false) % 36),
    l: 25 + (view.getUint32(8, false) % 46),
  };
}

/**
 * HSL を RGB の整数成分へ変換する。生成範囲に限らず、色相の 6 区間を扱う。
 * 入力は 0 <= h < 360、0 <= s, l <= 100 を前提とし、範囲の検証や補正は行わない。
 * 引数の分割代入で Hsl の各値を取り出し、RGB への変換の最後にだけ整数へ丸める。
 */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  // 百分率を 0〜1 に直してから計算する。
  const saturation = s / 100;
  const lightness = l / 100;
  // chroma は RGB の最大成分と最小成分の差、secondary は色相で変わる中間成分を表す。
  // offset は 3 成分へ共通に足す量であり、最終的な明度を合わせる役割を持つ。
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  // タプル型で成分が数値 3 個であることを型検査に伝える。このコードでは順に R・G・B として扱う。
  let channels: [number, number, number];

  // 色相環を 60 度ずつに分け、最大・中間・最小の成分を R・G・B のどこへ配置するかを決める。
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
  // 0〜1 の値を 0〜255 へ拡大して四捨五入する。途中で丸めると最終的な HEX が変わり得る。
  return {
    r: Math.round((r + offset) * 255),
    g: Math.round((g + offset) * 255),
    b: Math.round((b + offset) * 255),
  };
}

/**
 * 0〜255 の整数の RGB 成分を、表示と同一色の比較に使う大文字の #RRGGBB へ変換する。
 * 呼び出し側が有効な成分を渡す前提であり、範囲外の値を補正する処理は持たない。
 */
export function rgbToHex({ r, g, b }: Rgb): string {
  // ハッシュは小文字だが、色コードは仕様に合わせて大文字に統一する。
  return (
    '#' +
    [r, g, b]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * #RRGGBB 形式の HEX を RGB の整数成分へ戻す。
 * 先頭の # を除き、R・G・B に対応する 2 桁ずつを 16 進数として読む。
 * この関数は形式を検証しないため、保存済みの値は呼び出し側で検証してから渡す。
 */
export function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/** RGB を表示・コピー用の CSS 形式へ整える。カンマを使わない空白区切りを仕様とする。 */
export function formatRgb({ r, g, b }: Rgb): string {
  return `rgb(${r} ${g} ${b})`;
}

/**
 * 生成時の HSL を、彩度・明度の % を含む表示・コピー用の CSS 形式へ整える。
 * 丸め済みの RGB から HSL を逆算せず、元の生成値を表示するための関数とする。
 */
export function formatHsl({ h, s, l }: Hsl): string {
  return `hsl(${h} ${s}% ${l}%)`;
}
