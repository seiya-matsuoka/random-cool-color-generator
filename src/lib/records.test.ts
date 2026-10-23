import { describe, expect, it } from 'vitest';
import { digestToHash, digestToHsl, hslToRgb, rgbToHex } from './color';
import { addFavorite, appendHistory, removeFavorite } from './records';
import type { ColorRecord } from './types';

/**
 * 配列操作を検証するための、毎回同じ値になる生成記録のサンプルを作る。
 * SHA-256 の計算は行わず、index を埋めたバイト列からハッシュと色の対応を満たす固定データを組み立てる。
 * 色変換関数は入力データの整合性を保つために使い、期待する配列の順序・件数・結果は各ケースで指定する。
 * @param index - 記録の ID・日時・連番と、元のバイト列を区別するための番号。
 * @param overrides - ケースごとに上書きしたい値。Partial<ColorRecord> は全プロパティを省略可能にする型。
 */
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
    // 後ろに展開したプロパティが優先されるため、同じ HEX の別記録や時計の逆行も明示的に作れる。
    ...overrides,
  };
  // Object.freeze は浅い凍結なので、ネストした hsl も別に凍結して意図しない書き換えを検出する。
  // これはテスト入力への保護であり、本体が返す記録を自動で凍結する仕組みではない。
  Object.freeze(record.hsl);
  return Object.freeze(record);
}

/**
 * count 番目から 1 番目までの記録を並べた一覧を作る。上限の直前・到達・超過を同じ基準で準備する。
 * readonly は型検査で配列操作を制限し、Object.freeze は実行時にも入力配列の変更を検出する。
 */
function makeCollection(count: number): readonly ColorRecord[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => makeRecord(count - index)));
}

describe('履歴', () => {
  it('空の履歴へ生成記録を追加する', () => {
    // Arrange（準備）: 履歴がない状態と、初回の成功記録を用意する。
    const record = makeRecord(1);
    // Act + Assert（実行・検証）: 最初の 1 件がそのまま履歴になる。
    expect(appendHistory([], record)).toEqual([record]);
  });

  it('19 件から 20 件へ増やし、先頭と末尾の記録を保持する', () => {
    // Arrange（準備）: まだ 1 件も切り捨てる必要のない、上限直前の状態を作る。
    const history = makeCollection(19);
    const record = makeRecord(20);
    // Act（実行）: 20 件目を追加する。
    const result = appendHistory(history, record);
    // Assert（検証）: 件数だけでなく、新しい先頭と残る最古の記録も確認する。
    expect(result).toHaveLength(20);
    expect(result[0]).toEqual(record);
    expect(result[19]).toEqual(makeRecord(1));
  });

  it('21 件目を先頭へ追加し、最も古い 1 件だけを除外する', () => {
    // Arrange（準備）: 上限の 20 件が、新しいものから順に並ぶ状態とする。
    const history = makeCollection(20);
    // Act（実行）: 上限を超える新しい記録を追加する。
    const result = appendHistory(history, makeRecord(21));
    // Assert（検証）: 実装と同じ slice で期待値を作らず、残る全件の順序を固定の一覧で照合する。
    expect(result.map((record) => record.sequence)).toEqual([
      21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
    // 切り詰めが必要でも、元の入力配列から記録を削除してはいけない。
    expect(history).toEqual(makeCollection(20));
  });

  it('同じ HEX でも異なる生成記録として残す', () => {
    // Arrange（準備）: ID は異なり、ハッシュ・HSL・HEX は同じという 2 件を作る。
    const first = makeRecord(1);
    const second = makeRecord(2, { hash: first.hash, hsl: first.hsl, hex: first.hex });
    // Act + Assert（実行・検証）: お気に入りと異なり、履歴では同色の別記録も両方残る。
    expect(appendHistory(Object.freeze([first]), second)).toEqual([second, first]);
    expect(first.id).not.toBe(second.id);
  });

  it('時計が戻っても日時で再ソートしない', () => {
    // Arrange（準備）: 入力順と生成日時の大小を意図的に一致させず、新しい要求の日時も過去へ戻す。
    const first = makeRecord(1, { generatedAt: 5000 });
    const second = makeRecord(2, { generatedAt: 9000 });
    const next = makeRecord(3, { generatedAt: 1000 });
    // Act + Assert（実行・検証）: 日時の大小ではなく、追加順を基準に先頭へ置き、既存の順序も保つ。
    expect(appendHistory(Object.freeze([first, second]), next)).toEqual([next, first, second]);
  });

  it('入力配列と記録を変更しない', () => {
    // Arrange（準備）: 凍結した入力に加え、操作前の内容を独立したコピーとして保持する。
    const existing = makeRecord(1);
    const next = makeRecord(2);
    const history = Object.freeze([existing]);
    // structuredClone で hsl を含めてコピーする。参照の共有により比較元まで変わる事態を避ける。
    const before = structuredClone([existing, next]);
    // Act（実行）: 戻り値ではなく、呼び出しによる入力への副作用を調べる。
    appendHistory(history, next);
    // Assert（検証）: 元の配列、既存記録、追加した記録が、操作前の内容のままである。
    expect(history).toEqual([before[0]]);
    expect([existing, next]).toEqual(before);
  });
});

describe('お気に入りの登録', () => {
  it('空の一覧へ元の生成記録を登録する', () => {
    // Arrange（準備）: 未登録の記録と、空のお気に入りを用意する。
    const record = makeRecord(1);
    // Act + Assert（実行・検証）: 登録成功の status と、元の生成情報を持つ 1 件が返る。
    // toEqual は値を比較するため、新しいスナップショットでも内容が一致すれば成功する。
    expect(addFavorite([], record)).toEqual({ status: 'added', items: [record] });
  });

  it('登録順を使い、古い生成日時の色も先頭へ追加する', () => {
    // Arrange（準備）: 既存の 2 色より生成日時が古い、未登録の色を用意する。
    const first = makeRecord(1);
    const second = makeRecord(2);
    const next = makeRecord(3, { generatedAt: 0 });
    // Act + Assert（実行・検証）: 並び順は生成日時ではなく登録順とし、新たな登録が先頭に来る。
    expect(addFavorite(Object.freeze([first, second]), next)).toEqual({
      status: 'added',
      items: [next, first, second],
    });
  });

  it('19 色から 20 色へ追加できる', () => {
    // Arrange（準備）: 上限直前の 19 色と、まだ含まれていない 20 色目を使用する。
    // Act（実行）: 最後の空き枠へ登録する。
    const result = addFavorite(makeCollection(19), makeRecord(20));
    // Assert（検証）: 満杯になる登録までは成功し、既存の最古の色も残る。
    expect(result.status).toBe('added');
    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toEqual(makeRecord(20));
    expect(result.items[19]).toEqual(makeRecord(1));
  });

  it('20 色のときは新規追加を拒否し、自動削除しない', () => {
    // Arrange（準備）: 上限に達している一覧を作る。
    const favorites = makeCollection(20);
    // Act + Assert（実行・検証）: 21 色目への結果は full であり、既存の全記録と入力の内容は保持される。
    expect(addFavorite(favorites, makeRecord(21))).toEqual({ status: 'full', items: favorites });
    expect(favorites).toEqual(makeCollection(20));
  });

  it('同じ HEX の別記録でも最初の記録と位置を保持する', () => {
    // Arrange（準備）: 重複対象を一覧の先頭以外に置き、異なる ID で同じ色を再登録しようとする。
    const first = makeRecord(1);
    const other = makeRecord(2);
    const favorites = Object.freeze([other, first]);
    const duplicate = makeRecord(3, { hash: first.hash, hsl: first.hsl, hex: first.hex });
    // Act + Assert（実行・検証）: duplicate となり、新しい記録への置き換えも先頭への移動も起こらない。
    expect(addFavorite(favorites, duplicate)).toEqual({
      status: 'duplicate',
      items: [other, first],
    });
  });

  it('満杯でも登録済みの HEX は重複として判定する', () => {
    // Arrange（準備）: 件数上限と HEX の重複が同時に成り立つ状態を作る。
    const favorites = makeCollection(20);
    const first = makeRecord(10);
    const duplicate = makeRecord(21, { hash: first.hash, hsl: first.hsl, hex: first.hex });
    // Act + Assert（実行・検証）: full より duplicate が優先され、重複判定を先に行う仕様を確認する。
    expect(addFavorite(favorites, duplicate)).toEqual({ status: 'duplicate', items: favorites });
  });

  it('登録後に元の記録が変更されてもスナップショットを保持する', () => {
    // Arrange（準備）: 元の固定データは残し、記録と hsl をコピーして変更可能な入力を用意する。
    const original = makeRecord(1);
    const source = { ...original, hsl: { ...original.hsl } };
    // Act（実行）: 登録後に、入力の直下の値とネストした hsl の両方を書き換える。
    const result = addFavorite([], source);
    source.generatedAt = 0;
    source.hsl.h = 270;
    source.hex = '#B366FF';
    // Assert（検証）: 登録時の記録全体が残る。浅いコピーだけでは hsl.h の変更がここへ漏れて失敗する。
    expect(result.items).toEqual([original]);
  });

  it('登録先の配列と既存記録を変更しない', () => {
    // Arrange（準備）: 既存の一覧と登録する記録について、操作前の内容を深いコピーで保持する。
    const favorites = makeCollection(1);
    const record = makeRecord(2);
    const before = structuredClone([favorites, record]);
    // Act（実行）: 新しい色の登録を行う。
    addFavorite(favorites, record);
    // Assert（検証）: 次の一覧を返す処理が、渡された一覧や記録を直接変更していない。
    expect([favorites, record]).toEqual(before);
  });
});

describe('お気に入りの解除と履歴からの独立性', () => {
  it('指定した HEX だけを解除し、残る色の順序を保持する', () => {
    // Arrange（準備）: 3 色の中央を解除対象とし、残る 2 色の順序も観察できるようにする。
    const first = makeRecord(1);
    const second = makeRecord(2);
    const third = makeRecord(3);
    const favorites = Object.freeze([first, second, third]);
    // Act + Assert（実行・検証）: 対象だけが除かれ、解除結果・残る順序・入力が保持されることを確認する。
    expect(removeFavorite(favorites, second.hex)).toEqual({
      status: 'removed',
      items: [first, third],
    });
    expect(favorites).toEqual([first, second, third]);
  });

  // 0 件は空配列、2 件は対象だけが存在しない状態。どちらも通常の変更不要として扱う。
  it.each([0, 2])('対象がない %i 件の一覧は変更せず、記録を作り直さない', (count) => {
    // Arrange（準備）: 表の件数の一覧と、そこに含まれない白色の HEX を使用する。
    const favorites = makeCollection(count);
    // Act + Assert（実行・検証）: not-found を返し、日時や ID を含む全記録の内容を保つ。
    expect(removeFavorite(favorites, '#FFFFFF')).toEqual({ status: 'not-found', items: favorites });
  });

  it('20 色から解除し、空いた枠へ新しい色を登録できる', () => {
    // Arrange（準備）: 20 色の一覧から、10 番の記録の HEX を解除する条件とする。
    // Act（実行）: 既存のお気に入りを 1 色解除する。
    const removed = removeFavorite(makeCollection(20), makeRecord(10).hex);
    // Assert（検証）: 解除が成功して 1 枠空いたことを、次の操作の前に確認する。
    expect(removed.status).toBe('removed');
    expect(removed.items).toHaveLength(19);
    // Act（実行）: 解除後の一覧に対して、別の色を登録する。
    const added = addFavorite(removed.items, makeRecord(21));
    // Assert（検証）: 新しい色で 20 色へ戻り、解除した色が復活していない。
    expect(added.status).toBe('added');
    expect(added.items).toHaveLength(20);
    expect(added.items[0]).toEqual(makeRecord(21));
    expect(added.items.some((record) => record.hex === makeRecord(10).hex)).toBe(false);
  });

  it('履歴の上限から消えても、お気に入りに元の記録全体が残る', () => {
    // Arrange（準備）: 同じ記録を履歴とお気に入りに 1 件ずつ持たせる。
    const original = makeRecord(1);
    let history = appendHistory([], original);
    const favorites = addFavorite([], original).items;
    // Act（実行）: 履歴だけを上限より多く追加し、最初の記録を履歴の保持範囲から押し出す。
    for (let index = 2; index <= 22; index += 1) {
      history = appendHistory(history, makeRecord(index));
    }
    // Assert（検証）: 履歴から対象の ID が消えた後も、お気に入りには元の生成情報全体が残る。
    expect(history).toHaveLength(20);
    expect(history.some((record) => record.id === original.id)).toBe(false);
    expect(favorites).toEqual([original]);
  });

  it('お気に入りを解除しても、元の履歴と記録を変更しない', () => {
    // Arrange（準備）: 履歴にある色を、お気に入りにも登録する。
    const history = makeCollection(2);
    const record = makeRecord(1);
    const favorites = addFavorite([], record).items;
    // Act + Assert（実行・検証）: 解除結果は空となるが、履歴と解除前の入力一覧の内容は保たれる。
    expect(removeFavorite(favorites, record.hex)).toEqual({ status: 'removed', items: [] });
    expect(history).toEqual(makeCollection(2));
    expect(favorites).toEqual([record]);
  });
});
