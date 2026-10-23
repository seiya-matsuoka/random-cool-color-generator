import { describe, expect, it } from 'vitest';
import { digestToHash, digestToHsl, hslToRgb, rgbToHex } from './color';
import { addFavorite, appendHistory, removeFavorite } from './records';
import type { ColorRecord } from './types';

// 配列操作のテスト用に、色とハッシュの対応を満たす固定データを組み立てる。
// 期待する配列の順序・件数・操作結果は、各テスト側で独立して指定する。
function makeRecord(index: number, overrides: Partial<ColorRecord> = {}): ColorRecord {
  const digest = new ArrayBuffer(32);
  new DataView(digest).setUint32(0, index, false);
  const hsl = digestToHsl(digest);
  const record: ColorRecord = {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    generatedAt: 1792335600000 + index,
    sequence: index,
    attempt: 0,
    hash: digestToHash(digest),
    hsl,
    hex: rgbToHex(hslToRgb(hsl)),
    ...overrides,
  };
  Object.freeze(record.hsl);
  return Object.freeze(record);
}

function makeCollection(count: number): readonly ColorRecord[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => makeRecord(count - index)));
}

describe('履歴', () => {
  it('空の履歴へ生成記録を追加する', () => {
    const record = makeRecord(1);
    expect(appendHistory([], record)).toEqual([record]);
  });

  it('19 件から 20 件へ増やし、先頭と末尾の記録を保持する', () => {
    const history = makeCollection(19);
    const record = makeRecord(20);
    const result = appendHistory(history, record);
    expect(result).toHaveLength(20);
    expect(result[0]).toEqual(record);
    expect(result[19]).toEqual(makeRecord(1));
  });

  it('21 件目を先頭へ追加し、最も古い 1 件だけを除外する', () => {
    const history = makeCollection(20);
    const result = appendHistory(history, makeRecord(21));
    expect(result.map((record) => record.sequence)).toEqual([
      21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
    expect(history).toEqual(makeCollection(20));
  });

  it('同じ HEX でも異なる生成記録として残す', () => {
    const first = makeRecord(1);
    const second = makeRecord(2, { hash: first.hash, hsl: first.hsl, hex: first.hex });
    expect(appendHistory(Object.freeze([first]), second)).toEqual([second, first]);
    expect(first.id).not.toBe(second.id);
  });

  it('時計が戻っても日時で再ソートしない', () => {
    const first = makeRecord(1, { generatedAt: 5000 });
    const second = makeRecord(2, { generatedAt: 9000 });
    const next = makeRecord(3, { generatedAt: 1000 });
    expect(appendHistory(Object.freeze([first, second]), next)).toEqual([next, first, second]);
  });

  it('入力配列と記録を変更しない', () => {
    const existing = makeRecord(1);
    const next = makeRecord(2);
    const history = Object.freeze([existing]);
    const before = structuredClone([existing, next]);
    appendHistory(history, next);
    expect(history).toEqual([before[0]]);
    expect([existing, next]).toEqual(before);
  });
});

describe('お気に入りの登録', () => {
  it('空の一覧へ元の生成記録を登録する', () => {
    const record = makeRecord(1);
    expect(addFavorite([], record)).toEqual({ status: 'added', items: [record] });
  });

  it('登録順を使い、古い生成日時の色も先頭へ追加する', () => {
    const first = makeRecord(1);
    const second = makeRecord(2);
    const next = makeRecord(3, { generatedAt: 0 });
    expect(addFavorite(Object.freeze([first, second]), next)).toEqual({
      status: 'added',
      items: [next, first, second],
    });
  });

  it('19 色から 20 色へ追加できる', () => {
    const result = addFavorite(makeCollection(19), makeRecord(20));
    expect(result.status).toBe('added');
    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toEqual(makeRecord(20));
    expect(result.items[19]).toEqual(makeRecord(1));
  });

  it('20 色のときは新規追加を拒否し、自動削除しない', () => {
    const favorites = makeCollection(20);
    expect(addFavorite(favorites, makeRecord(21))).toEqual({ status: 'full', items: favorites });
    expect(favorites).toEqual(makeCollection(20));
  });

  it('同じ HEX の別記録でも最初の記録と位置を保持する', () => {
    const first = makeRecord(1);
    const other = makeRecord(2);
    const favorites = Object.freeze([other, first]);
    const duplicate = makeRecord(3, { hash: first.hash, hsl: first.hsl, hex: first.hex });
    expect(addFavorite(favorites, duplicate)).toEqual({
      status: 'duplicate',
      items: [other, first],
    });
  });

  it('満杯でも登録済みの HEX は重複として判定する', () => {
    const favorites = makeCollection(20);
    const first = makeRecord(10);
    const duplicate = makeRecord(21, { hash: first.hash, hsl: first.hsl, hex: first.hex });
    expect(addFavorite(favorites, duplicate)).toEqual({ status: 'duplicate', items: favorites });
  });

  it('登録後に元の記録が変更されてもスナップショットを保持する', () => {
    const original = makeRecord(1);
    const source = { ...original, hsl: { ...original.hsl } };
    const result = addFavorite([], source);
    source.generatedAt = 0;
    source.hsl.h = 270;
    source.hex = '#B366FF';
    expect(result.items).toEqual([original]);
  });

  it('登録先の配列と既存記録を変更しない', () => {
    const favorites = makeCollection(1);
    const record = makeRecord(2);
    const before = structuredClone([favorites, record]);
    addFavorite(favorites, record);
    expect([favorites, record]).toEqual(before);
  });
});

describe('お気に入りの解除と履歴からの独立性', () => {
  it('指定した HEX だけを解除し、残る色の順序を保持する', () => {
    const first = makeRecord(1);
    const second = makeRecord(2);
    const third = makeRecord(3);
    const favorites = Object.freeze([first, second, third]);
    expect(removeFavorite(favorites, second.hex)).toEqual({
      status: 'removed',
      items: [first, third],
    });
    expect(favorites).toEqual([first, second, third]);
  });

  it.each([0, 2])('対象がない %i 件の一覧は変更せず、記録を作り直さない', (count) => {
    const favorites = makeCollection(count);
    expect(removeFavorite(favorites, '#FFFFFF')).toEqual({ status: 'not-found', items: favorites });
  });

  it('20 色から解除し、空いた枠へ新しい色を登録できる', () => {
    const removed = removeFavorite(makeCollection(20), makeRecord(10).hex);
    expect(removed.status).toBe('removed');
    expect(removed.items).toHaveLength(19);
    const added = addFavorite(removed.items, makeRecord(21));
    expect(added.status).toBe('added');
    expect(added.items).toHaveLength(20);
    expect(added.items[0]).toEqual(makeRecord(21));
    expect(added.items.some((record) => record.hex === makeRecord(10).hex)).toBe(false);
  });

  it('履歴の上限から消えても、お気に入りに元の記録全体が残る', () => {
    const original = makeRecord(1);
    let history = appendHistory([], original);
    const favorites = addFavorite([], original).items;
    for (let index = 2; index <= 22; index += 1) {
      history = appendHistory(history, makeRecord(index));
    }
    expect(history).toHaveLength(20);
    expect(history.some((record) => record.id === original.id)).toBe(false);
    expect(favorites).toEqual([original]);
  });

  it('お気に入りを解除しても、元の履歴と記録を変更しない', () => {
    const history = makeCollection(2);
    const record = makeRecord(1);
    const favorites = addFavorite([], record).items;
    expect(removeFavorite(favorites, record.hex)).toEqual({ status: 'removed', items: [] });
    expect(history).toEqual(makeCollection(2));
    expect(favorites).toEqual([record]);
  });
});
