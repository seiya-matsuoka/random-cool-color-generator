import { digestToHsl, hslToRgb, rgbToHex } from './color';
import type { ColorRecord } from './types';

/** 保存領域を識別する。任意のキー文字列を UI から受け取らないための境界。 */
export type CollectionKind = 'history' | 'favorites';

/** 除外・重複・上限調整を区別し、読み込みだけでは書き戻さずに案内できるようにする。 */
export type CollectionAdjustments = { invalid: number; duplicate: number; overflow: number };

/** 保護対象の生データは、確認した内容と Reset 確定時の内容を比較するためだけに保持する。 */
export type ValidatedCollection =
  | { status: 'ready'; items: ColorRecord[]; adjustments: CollectionAdjustments }
  | { status: 'protected'; raw: string };

/** null と配列を除外してから、値を unknown の辞書として調べるための型ガード。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 型の形に加えて、保存された hash・HSL・HEX の対応を検証する。真正性の検証は行わない。 */
function readRecord(value: unknown): ColorRecord | null {
  if (!isObject(value)) return null;
  const { id, generatedAt, sequence, attempt, hash, hex, hsl } = value;
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
    typeof generatedAt !== 'number' ||
    !Number.isSafeInteger(generatedAt) ||
    generatedAt < 0 ||
    Number.isNaN(new Date(generatedAt).getTime()) ||
    typeof sequence !== 'number' ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    typeof attempt !== 'number' ||
    !Number.isInteger(attempt) ||
    attempt < 0 ||
    attempt > 7 ||
    typeof hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(hash) ||
    typeof hex !== 'string' ||
    !/^#[0-9A-F]{6}$/.test(hex) ||
    !isObject(hsl)
  )
    return null;
  const { h, s, l } = hsl;
  if (
    typeof h !== 'number' ||
    !Number.isInteger(h) ||
    h < 160 ||
    h > 270 ||
    typeof s !== 'number' ||
    !Number.isInteger(s) ||
    s < 65 ||
    s > 100 ||
    typeof l !== 'number' ||
    !Number.isInteger(l) ||
    l < 25 ||
    l > 70
  )
    return null;

  // 形式を確認済みなので必ず 32 バイトとなる。既存の割り当て・変換式を再利用する。
  const digest = Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16),
  ).buffer;
  const expected = digestToHsl(digest);
  if (
    expected.h !== h ||
    expected.s !== s ||
    expected.l !== l ||
    rgbToHex(hslToRgb({ h, s, l })) !== hex
  )
    return null;
  // 未知の追加プロパティは保存へ持ち越さず、検証済みの項目だけから独立した記録を作る。
  return { id, generatedAt, sequence, attempt, hash, hex, hsl: { h, s, l } };
}

/** JSON は信頼できない入力として受け取り、形式・記録の整合性・一覧の制限を確認する。 */
export function validateCollection(raw: string | null, kind: CollectionKind): ValidatedCollection {
  const adjustments: CollectionAdjustments = { invalid: 0, duplicate: 0, overflow: 0 };
  if (raw === null) return { status: 'ready', items: [], adjustments };
  let value: unknown;
  try {
    // JSON.parse の返却値を unknown に閉じ込め、as ColorRecord[] で検証を省略しない。
    value = JSON.parse(raw);
  } catch {
    return { status: 'protected', raw };
  }
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.items)) {
    return { status: 'protected', raw };
  }
  const records = value.items.map(readRecord).filter((item) => item !== null);
  adjustments.invalid = value.items.length - records.length;
  if (value.items.length > 0 && records.length === 0) return { status: 'protected', raw };

  const seen = new Set<string>();
  const items: ColorRecord[] = [];
  for (const record of records) {
    const identity = kind === 'history' ? record.id : record.hex;
    if (seen.has(identity)) {
      adjustments.duplicate += 1;
      continue;
    }
    seen.add(identity);
    if (items.length >= 20) {
      adjustments.overflow += 1;
      continue;
    }
    items.push(record);
  }
  return { status: 'ready', items, adjustments };
}
