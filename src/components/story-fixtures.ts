import type { ColorRecord } from '../lib/types';
import type { Confirmation } from './ConfirmDialog';

/** 技術設計の既知値。実際の日時取得・Web Crypto・保存済みデータは Story で使用しない。 */
export const knownRecord: ColorRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  generatedAt: 1792335600000,
  sequence: 1,
  attempt: 0,
  hash: '633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab',
  hsl: { h: 207, s: 77, l: 50 },
  hex: '#1D89E2',
};

export const generatedAtLabel = '2026-10-19 00:00:00.000 UTC+09:00';

/** 上限 Story の一覧には存在しない色。寒色の上限 HSL と、それに対応する固定値を使用する。 */
export const unregisteredRecord: ColorRecord = {
  ...knownRecord,
  id: '00000000-0000-4000-8000-000000000022',
  sequence: 22,
  hash: `0000006e000000230000002d${'0'.repeat(40)}`,
  hsl: { h: 270, s: 100, l: 70 },
  hex: '#B366FF',
};

// 上限確認用の固定色。全件が寒色の範囲内で、HEX は異なる。UI の実行時に色を生成しない。
const samples = [
  ['#1DE2A0', 160],
  ['#1DE2A3', 161],
  ['#1DE2A7', 162],
  ['#1DE2AA', 163],
  ['#1DE2AD', 164],
  ['#1DE2B1', 165],
  ['#1DE2B4', 166],
  ['#1DE2B7', 167],
  ['#1DE2BA', 168],
  ['#1DE2BE', 169],
  ['#1DE2C1', 170],
  ['#1DE2C4', 171],
  ['#1DE2C7', 172],
  ['#1DE2CB', 173],
  ['#1DE2CE', 174],
  ['#1DE2D1', 175],
  ['#1DE2D5', 176],
  ['#1DE2D8', 177],
  ['#1DE2DB', 178],
] as const;

// as const は表のリテラル値と要素数の情報を保つ。データを生成する処理や実行時の検証ではない。
// 人工的な 32 バイト相当の値は、先頭 3 整数が h - 160 / 12 / 25 となる固定パターン。
// 実際の SHA-256 を計算せず、技術設計の HSL 割り当てと矛盾しない表示データにする。
export const fullFavorites: readonly ColorRecord[] = [
  knownRecord,
  ...samples.map(([hex, h], index) => ({
    id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
    generatedAt: 1792335600000 - (index + 1) * 1000,
    sequence: index + 2,
    attempt: 0,
    hash: `${(h - 160).toString(16).padStart(8, '0')}0000000c00000019${'0'.repeat(40)}`,
    hsl: { h, s: 77, l: 50 },
    hex,
  })),
];

/** 同じ HEX でも別 ID の生成記録として履歴に残り、登録済み表示は HEX で連動する例。 */
export const duplicateRecord: ColorRecord = {
  ...knownRecord,
  id: '00000000-0000-4000-8000-000000000021',
  generatedAt: 1792335600123,
  sequence: 21,
};

export const historyRecords: readonly ColorRecord[] = [
  duplicateRecord,
  ...fullFavorites.slice(0, 3),
];
export const fullHistory: readonly ColorRecord[] = [duplicateRecord, ...fullFavorites.slice(0, 19)];

/** 確認文も固定し、通常の削除と破損データの Reset の影響範囲を読み比べられるようにする。 */
export const confirmations = {
  clear: {
    title: 'Clear history?',
    description: 'Clear all saved history. Your current color and favorites will remain.',
    confirmLabel: 'Clear history',
    focusTarget: 'history',
  },
  clearTab: {
    title: 'Clear history?',
    description:
      'Clear history in this tab only. Saved history could not be changed. Your current color and favorites will remain.',
    confirmLabel: 'Clear history',
    focusTarget: 'history',
  },
  remove: {
    title: 'Remove favorite?',
    description: 'Remove this color from favorites. Your current color and history will remain.',
    confirmLabel: 'Remove favorite',
    targetHex: knownRecord.hex,
    focusTarget: 'favorites',
  },
  resetHistory: {
    title: 'Reset history?',
    description:
      'Delete unreadable saved history and history in this tab. Your current color and favorites will remain.',
    confirmLabel: 'Reset history',
    focusTarget: 'history',
  },
  resetFavorites: {
    title: 'Reset favorites?',
    description: 'Delete unreadable saved favorites. Your current color and history will remain.',
    confirmLabel: 'Reset favorites',
    focusTarget: 'favorites',
  },
} satisfies Record<string, Confirmation>;
