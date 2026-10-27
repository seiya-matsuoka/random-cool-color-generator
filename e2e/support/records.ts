import type { ColorRecord } from '../../src/lib/types';

// 実データ・Story を import しない。期待値はアプリの変換関数から算出しない。
export const fixedTime = 1792335600000;
export const keys = {
  history: 'random-cool-color-generator:history',
  favorites: 'random-cool-color-generator:favorites',
} as const;
export type RegionName = keyof typeof keys;
export const known: ColorRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  generatedAt: fixedTime,
  sequence: 1,
  attempt: 0,
  hash: '633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab',
  hsl: { h: 207, s: 77, l: 50 },
  hex: '#1D89E2',
};
export const other: ColorRecord = {
  ...known,
  id: '00000000-0000-4000-8000-000000000002',
  generatedAt: fixedTime + 123,
  sequence: 2,
  hash: '0'.repeat(64),
  hsl: { h: 160, s: 65, l: 25 },
  hex: '#16694E',
};
export const duplicate: ColorRecord = {
  ...known,
  id: '00000000-0000-4000-8000-000000000003',
  generatedAt: fixedTime + 7,
  sequence: 3,
};

// 先頭 3 整数を h-160 / 12 / 25 にした固定バイト列と対応する値。
// SHA-256 の真正性を主張するデータではなく、保存の整合性検証を満たす寒色 20 色。
const samples = [
  '#1DE2A0',
  '#1DE2A3',
  '#1DE2A7',
  '#1DE2AA',
  '#1DE2AD',
  '#1DE2B1',
  '#1DE2B4',
  '#1DE2B7',
  '#1DE2BA',
  '#1DE2BE',
  '#1DE2C1',
  '#1DE2C4',
  '#1DE2C7',
  '#1DE2CB',
  '#1DE2CE',
  '#1DE2D1',
  '#1DE2D5',
  '#1DE2D8',
  '#1DE2DB',
];
export const twenty = [
  known,
  ...samples.map((hex, index): ColorRecord => ({
    id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
    generatedAt: fixedTime - (index + 1) * 1000,
    sequence: index + 10,
    attempt: 0,
    hash: `${index.toString(16).padStart(8, '0')}0000000c00000019${'0'.repeat(40)}`,
    hsl: { h: 160 + index, s: 77, l: 50 },
    hex,
  })),
];
export const envelope = (items: readonly unknown[], version = 1) =>
  JSON.stringify({ version, items });
