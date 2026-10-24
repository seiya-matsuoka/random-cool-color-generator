import { describe, expect, it } from 'vitest';
import { validateCollection } from './storage-validation';
import type { ColorRecord } from './types';

// 技術設計の既知値を直接指定する。検証対象の関数から期待する記録を生成しない。
const record: ColorRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  generatedAt: 1792335600000,
  sequence: 1,
  attempt: 0,
  hash: '633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab',
  hsl: { h: 207, s: 77, l: 50 },
  hex: '#1D89E2',
};

/** 不正値も含む JSON 入力を作る。unknown[] は記録の型検査を意図的に通さない入力境界。 */
function stored(items: unknown[], version = 1): string {
  return JSON.stringify({ version, items });
}

describe('保存データの検証', () => {
  it.each([
    ['下限', '0'.repeat(64), { h: 160, s: 65, l: 25 }, '#16694E'],
    ['上限', `0000006e000000230000002d${'0'.repeat(40)}`, { h: 270, s: 100, l: 70 }, '#B366FF'],
  ] as const)('HSL の%sを含む正常記録を受け入れる', (_name, hash, hsl, hex) => {
    // Arrange: 端の値を不正と取り違えないよう、変換済みの期待値を独立した固定表で用意する。
    const boundary = { ...record, hash, hsl: { ...hsl }, hex };
    // Act + Assert: 範囲外の拒否だけでなく、境界そのものの受け入れも保証する。
    expect(validateCollection(stored([boundary]), 'history')).toMatchObject({
      status: 'ready',
      items: [boundary],
    });
  });

  it('お気に入りは ID が同じ別色も HEX の単位で残す', () => {
    // Arrange: UUID の形式は正常で、色だけが異なる整合した 2 記録。
    const other = {
      ...record,
      hash: '0'.repeat(64),
      hsl: { h: 160, s: 65, l: 25 },
      hex: '#16694E',
    };
    // Act + Assert: UI は HEX を key に使い、検証で独自の ID 重複除外を追加しない。
    expect(validateCollection(stored([record, other]), 'favorites')).toMatchObject({
      status: 'ready',
      items: [record, other],
    });
  });

  it.each([null, stored([])])('不存在と正常な空配列を保護しない: %s', (raw) => {
    // Arrange: 記録が存在しない正常な 2 通りの入力。
    // Act + Assert: 空であることを破損と取り違えず、調整も不要とする。
    expect(validateCollection(raw, 'history')).toEqual({
      status: 'ready',
      items: [],
      adjustments: { invalid: 0, duplicate: 0, overflow: 0 },
    });
  });

  it('既知値の記録をそのまま読み込む', () => {
    // Arrange: hash・HSL・HEX が整合する固定記録。
    const raw = stored([record]);
    // Act + Assert: 読み込み順と元の生成情報を維持する。
    expect(validateCollection(raw, 'history')).toEqual({
      status: 'ready',
      items: [record],
      adjustments: { invalid: 0, duplicate: 0, overflow: 0 },
    });
  });

  it.each(['{', 'null', '[]', '{}', stored([], 2), '{"version":1,"items":{}}', stored([null])])(
    '破損・未対応・全件不正を保護する: %s',
    (raw) => {
      // Arrange: 空の正常一覧と区別すべき envelope と非空の全件不正を列挙する。
      // Act + Assert: Reset で照合できるよう、修正せず生文字列を保持する。
      expect(validateCollection(raw, 'history')).toEqual({ status: 'protected', raw });
    },
  );

  it('一部不正を除外し、正常な記録を保持する', () => {
    // Arrange: 不正記録の前後に正常記録を置き、全件不正との違いを確認する。
    const other = { ...record, id: '00000000-0000-4000-8000-000000000002', sequence: 2 };
    const raw = stored([record, null, other]);
    // Act + Assert: 正常記録の順序を変えず、除外の件数を通知側へ返す。
    expect(validateCollection(raw, 'history')).toEqual({
      status: 'ready',
      items: [record, other],
      adjustments: { invalid: 1, duplicate: 0, overflow: 0 },
    });
  });

  // それぞれ 1 フィールドだけを壊し、別の条件で偶然拒否されるケースを避ける。
  const invalidFields: [string, Partial<ColorRecord>][] = [
    ['UUID', { id: 'not-a-uuid' }],
    ['負の時刻', { generatedAt: -1 }],
    ['小数時刻', { generatedAt: 0.5 }],
    ['安全整数を超える時刻', { generatedAt: Number.MAX_SAFE_INTEGER + 1 }],
    ['Date の範囲外', { generatedAt: 8640000000000001 }],
    ['連番 0', { sequence: 0 }],
    ['小数の連番', { sequence: 1.5 }],
    ['安全整数を超える連番', { sequence: Number.MAX_SAFE_INTEGER + 1 }],
    ['試行番号 -1', { attempt: -1 }],
    ['試行番号 8', { attempt: 8 }],
    ['小数の試行番号', { attempt: 0.5 }],
    ['大文字 hash', { hash: record.hash.toUpperCase() }],
    ['短い hash', { hash: '0'.repeat(63) }],
    ['不正な hash 文字', { hash: 'g'.repeat(64) }],
    ['小文字 HEX', { hex: '#1d89e2' }],
    ['不正な HEX', { hex: '#GGGGGG' }],
    ['HEX の不一致', { hex: '#000000' }],
    ['色相の範囲外', { hsl: { h: 159, s: 77, l: 50 } }],
    ['彩度の範囲外', { hsl: { h: 207, s: 101, l: 50 } }],
    ['明度の範囲外', { hsl: { h: 207, s: 77, l: 24 } }],
    ['HSL の小数', { hsl: { h: 207.5, s: 77, l: 50 } }],
    ['hash と HSL の不一致', { hsl: { h: 208, s: 77, l: 50 } }],
  ];
  it.each(invalidFields)('%s を受け入れない', (_name, change) => {
    // Arrange: 他の項目は正常な既知値のままにする。
    const raw = stored([{ ...record, ...change }]);
    // Act + Assert: 唯一の記録が不正なので、空にして通常保存へ進めない。
    expect(validateCollection(raw, 'history')).toEqual({ status: 'protected', raw });
  });

  it.each(['id', 'generatedAt', 'sequence', 'attempt', 'hash', 'hsl', 'hex'])(
    '%s の欠落を拒否する',
    (field) => {
      // Arrange: JSON 上の欠落を再現するため、unknown 値の辞書として扱う。
      const incomplete: Record<string, unknown> = { ...record };
      delete incomplete[field];
      const raw = stored([incomplete]);
      // Act + Assert: TypeScript の型があっても、保存値は実行時に検証する必要がある。
      expect(validateCollection(raw, 'history')).toEqual({ status: 'protected', raw });
    },
  );

  it.each([
    false,
    1,
    'record',
    [],
    { ...record, hsl: null },
    { ...record, hsl: [] },
    { ...record, hsl: { h: 207 } },
  ])('記録や HSL の構造不正を拒否する', (item) => {
    // Arrange: プリミティブ・配列・欠けたオブジェクトを保存データに混ぜる。
    const raw = stored([item]);
    // Act + Assert: 型の形を推測して補修せず、全件不正として保護する。
    expect(validateCollection(raw, 'favorites')).toEqual({ status: 'protected', raw });
  });

  it('履歴は同じ HEX の別 ID を残し、ID 重複だけを先頭優先で除く', () => {
    // Arrange: 同じ ID の後続記録には別の連番を入れ、どちらを残すかを明確にする。
    const other = { ...record, id: '00000000-0000-4000-8000-000000000002', sequence: 2 };
    // Act + Assert: 日時の再ソートや HEX による除外を行わない。
    expect(
      validateCollection(stored([other, record, { ...record, sequence: 3 }]), 'history'),
    ).toEqual({
      status: 'ready',
      items: [other, record],
      adjustments: { invalid: 0, duplicate: 1, overflow: 0 },
    });
  });

  it('お気に入りは同じ HEX の最初の記録を保持する', () => {
    // Arrange: 記録単位の ID と連番だけが異なる同じ色。
    const other = { ...record, id: '00000000-0000-4000-8000-000000000002', sequence: 2 };
    // Act + Assert: 元の記録を保ち、後の同色記録へ置き換えない。
    expect(validateCollection(stored([record, other]), 'favorites')).toEqual({
      status: 'ready',
      items: [record],
      adjustments: { invalid: 0, duplicate: 1, overflow: 0 },
    });
  });

  it('全件を検証してから上限を適用する', () => {
    // Arrange: 先頭 20 件は不正。先に slice すると後続の正常記録を見落とす。
    const raw = stored([...Array<null>(20).fill(null), record]);
    // Act + Assert: 正常な 1 件があるため、保護状態にはしない。
    expect(validateCollection(raw, 'history')).toEqual({
      status: 'ready',
      items: [record],
      adjustments: { invalid: 20, duplicate: 0, overflow: 0 },
    });
  });

  it('履歴は入力順の先頭 20 件を残す', () => {
    // Arrange: 色は同じでも ID が異なる 21 記録。期待順は連番の明示値で検証する。
    const items = Array.from({ length: 21 }, (_, i) => ({
      ...record,
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      sequence: i + 1,
    }));
    // Act: 保存内容は書き換えず、利用用の一覧だけを調整する。
    const result = validateCollection(stored(items), 'history');
    // Assert: 新しい順序を推測せず、与えられた順を保つ。
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('正常な記録は保護しない');
    expect(result.items.map((item) => item.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(result.adjustments).toEqual({ invalid: 0, duplicate: 0, overflow: 1 });
  });
});
