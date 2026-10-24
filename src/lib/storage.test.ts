import { afterEach, describe, expect, it, vi } from 'vitest';
import { digestToHash, digestToHsl, hslToRgb, rgbToHex } from './color';
import { mutateCollection, readCollection, resetCollection, storageKeys } from './storage';
import type { StoragePort, StorageProvider } from './storage';
import type { ColorRecord } from './types';

/** 固定バイト列で整合する記録を作る。期待する保存結果・順序は各テストで直接指定する。 */
function makeRecord(index: number): ColorRecord {
  const digest = new ArrayBuffer(32);
  new DataView(digest).setUint32(0, index, false);
  const hsl = digestToHsl(digest);
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    generatedAt: 1792335600000 + index,
    sequence: index,
    attempt: 0,
    hash: digestToHash(digest),
    hsl,
    hex: rgbToHex(hslToRgb(hsl)),
  };
}
const stored = (items: ColorRecord[]) => JSON.stringify({ version: 1, items });

// DOM は用意せず、既定の保存領域取得だけを小さな window オブジェクトで検証する。
afterEach(() => vi.unstubAllGlobals());

/** ケースごとに独立した保存領域。API の例外は保存内容を変更する前に投げさせる。 */
function setup() {
  const values = new Map<string, string>();
  const port: StoragePort = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  const provide: StorageProvider = () => port;
  return { values, port, provide };
}

describe('保存アダプターの読み込み', () => {
  it('既定の provider が window の対象キーへ読み書き・Reset する', () => {
    // Arrange: 利用者のブラウザではなく、このケースだけの保存オブジェクト。
    const { values, port } = setup();
    const record = makeRecord(1);
    vi.stubGlobal('window', { localStorage: port });
    // Act: provider を省略した公開 API の経路も通す。
    expect(readCollection('history')).toMatchObject({ status: 'ready', items: [] });
    expect(mutateCollection({ type: 'append-history', record })).toMatchObject({
      status: 'saved',
      items: [record],
    });
    values.set(storageKeys.favorites, '{');
    expect(resetCollection('favorites', '{')).toEqual({ status: 'saved' });
    // Assert: 既定経路も専用キーだけを操作し、他方の保存を維持する。
    expect(values.has(storageKeys.history)).toBe(true);
    expect(values.has(storageKeys.favorites)).toBe(false);
  });
  it('読み込みと調整だけでは保存を書き換えない', () => {
    // Arrange: 重複と一部不正を含むが、利用可能な記録もある保存内容。
    const { values, port, provide } = setup();
    const record = makeRecord(1);
    const raw = JSON.stringify({ version: 1, items: [record, record, null] });
    values.set(storageKeys.history, raw);
    // Act: 履歴だけを読む。
    const result = readCollection('history', provide);
    // Assert: 利用用に調整しても、生データ・他キーには触れない。
    expect(result).toEqual({
      status: 'ready',
      items: [record],
      adjustments: { invalid: 1, duplicate: 1, overflow: 0 },
    });
    expect(values.get(storageKeys.history)).toBe(raw);
    expect(port.setItem).not.toHaveBeenCalled();
    expect(port.removeItem).not.toHaveBeenCalled();
    expect(port.getItem).toHaveBeenCalledExactlyOnceWith(storageKeys.history);
  });

  it('一方の読み取り例外でも他方を読み込める', () => {
    // Arrange: 履歴キーにだけ読み取り例外を注入する。
    const { values, port, provide } = setup();
    const record = makeRecord(1);
    values.set(storageKeys.favorites, stored([record]));
    vi.mocked(port.getItem).mockImplementation((key) => {
      if (key === storageKeys.history) throw new Error('read failed');
      return values.get(key) ?? null;
    });
    // Act + Assert: エラーは領域の結果に閉じ込め、外へ throw しない。
    expect(readCollection('history', provide)).toEqual({ status: 'unavailable' });
    expect(readCollection('favorites', provide)).toMatchObject({
      status: 'ready',
      items: [record],
    });
  });

  it('保存領域の取得そのものの例外を扱う', () => {
    // Arrange: ブラウザの localStorage getter に相当する境界を失敗させる。
    const provide = () => {
      throw new Error('storage blocked');
    };
    // Act + Assert: JSON 破損ではなく利用不可として通知できる結果を返す。
    expect(readCollection('history', provide)).toEqual({ status: 'unavailable' });
  });
});

describe('最新の保存データへの操作', () => {
  it('履歴は最新の正常化済み一覧へ追加し、version 付きで保存する', () => {
    // Arrange: 呼び出し側の配列ではなく、今保存されている記録を基準にする。
    const { values, port, provide } = setup();
    const first = makeRecord(1);
    const next = makeRecord(2);
    values.set(storageKeys.history, JSON.stringify({ version: 1, items: [first, null] }));
    // Act: 新規生成に対応する明示的な保存操作。
    const result = mutateCollection({ type: 'append-history', record: next }, provide);
    // Assert: 読み直した記録を失わず、保存内容も戻り値も同じ順序となる。
    expect(result).toEqual({
      status: 'saved',
      items: [next, first],
      adjustments: { invalid: 1, duplicate: 0, overflow: 0 },
    });
    // JSON オブジェクトのプロパティ順は仕様に含めず、envelope と記録の意味を比較する。
    const saved: unknown = JSON.parse(values.get(storageKeys.history) ?? 'null');
    expect(saved).toEqual({ version: 1, items: [next, first] });
    expect(port.setItem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(port.setItem).mock.calls[0]?.[0]).toBe(storageKeys.history);
  });

  it('履歴保存失敗時にタブ内利用できる更新案を返す', () => {
    // Arrange: 最新保存一覧は読めるが、書き込みは失敗する。
    const { values, port, provide } = setup();
    const first = makeRecord(1);
    const next = makeRecord(2);
    values.set(storageKeys.history, stored([first]));
    vi.mocked(port.setItem).mockImplementation(() => {
      throw new Error('quota');
    });
    // Act: 生成成功を履歴保存失敗と区別する。
    const result = mutateCollection({ type: 'append-history', record: next }, provide);
    // Assert: 生データはそのまま。更新案は保存成功を意味しない。
    expect(result).toEqual({ status: 'unavailable', historyFallback: [next, first] });
    expect(values.get(storageKeys.history)).toBe(stored([first]));
  });

  it('読み直しに失敗した場合は、知らない一覧で履歴を上書きしない', () => {
    // Arrange: getItem で失敗するので、更新案の基準すら得られない。
    const { port, provide } = setup();
    vi.mocked(port.getItem).mockImplementation(() => {
      throw new Error('read failed');
    });
    // Act + Assert: 最後の表示一覧への追加は hook 側で行えるよう、失敗だけを返す。
    expect(mutateCollection({ type: 'append-history', record: makeRecord(1) }, provide)).toEqual({
      status: 'unavailable',
    });
    expect(port.setItem).not.toHaveBeenCalled();
  });

  it('お気に入りの登録を保存する', () => {
    // Arrange: 未登録の固定記録を空のお気に入りへ追加する。
    const { values, provide } = setup();
    const record = makeRecord(1);
    // Act: 登録結果を保存する。
    const result = mutateCollection({ type: 'add-favorite', record }, provide);
    // Assert: saved の場合だけ画面へ反映できる。
    expect(result).toMatchObject({ status: 'saved', items: [record] });
    expect(values.get(storageKeys.favorites)).toBe(stored([record]));
  });

  it('お気に入りの重複は元の記録を保持し、書き込まない', () => {
    // Arrange: 別 ID の同じ HEX を追加しようとする。
    const { values, port, provide } = setup();
    const first = makeRecord(1);
    values.set(storageKeys.favorites, stored([first]));
    // Act: 他タブで先に登録された場合も、保存一覧の記録を優先する。
    const result = mutateCollection(
      { type: 'add-favorite', record: { ...first, id: makeRecord(2).id } },
      provide,
    );
    // Assert: 通常の保存成功や API エラーと区別する。
    expect(result).toMatchObject({ status: 'duplicate', items: [first] });
    expect(port.setItem).not.toHaveBeenCalled();
  });

  it('お気に入り 20 色では自動削除せず追加を拒否する', () => {
    // Arrange: 同じ固定パターンから、互いに異なる 20 色を用意する。
    const { values, port, provide } = setup();
    const items = Array.from({ length: 20 }, (_, index) => makeRecord(index + 1));
    values.set(storageKeys.favorites, stored(items));
    // Act + Assert: 上限到達は保存例外ではなく full とする。
    expect(
      mutateCollection({ type: 'add-favorite', record: makeRecord(21) }, provide),
    ).toMatchObject({ status: 'full', items });
    expect(port.setItem).not.toHaveBeenCalled();
  });

  it('お気に入りの解除は指定 HEX だけを保存から除く', () => {
    // Arrange: 2 色のうち先頭を対象にする。
    const { values, provide } = setup();
    const first = makeRecord(1);
    const other = makeRecord(2);
    values.set(storageKeys.favorites, stored([first, other]));
    // Act: 最新一覧へ解除を適用する。
    const result = mutateCollection({ type: 'remove-favorite', hex: first.hex }, provide);
    // Assert: 残りの記録は元の情報を保持する。
    expect(result).toMatchObject({ status: 'saved', items: [other] });
    const saved: unknown = JSON.parse(values.get(storageKeys.favorites) ?? 'null');
    expect(saved).toEqual({ version: 1, items: [other] });
  });

  it('確認中に対象が消えた場合は変更不要として再作成しない', () => {
    // Arrange: 確認後、別タブで対象が既に解除された状態。
    const { values, port, provide } = setup();
    const other = makeRecord(2);
    values.set(storageKeys.favorites, stored([other]));
    // Act + Assert: 元の対象記録を引数で受け取らず、HEX の存在を読み直して確認する。
    expect(
      mutateCollection({ type: 'remove-favorite', hex: makeRecord(1).hex }, provide),
    ).toMatchObject({ status: 'not-found', items: [other] });
    expect(port.setItem).not.toHaveBeenCalled();
  });

  it.each(['add', 'remove'] as const)('お気に入りの %s 保存失敗を成功扱いにしない', (action) => {
    // Arrange: 保存前の一覧は読めるが、setItem は例外を投げる。
    const { values, port, provide } = setup();
    const first = makeRecord(1);
    const before = stored([first]);
    values.set(storageKeys.favorites, before);
    vi.mocked(port.setItem).mockImplementation(() => {
      throw new Error('write failed');
    });
    // Act: 追加・解除の両方が同じ永続化境界を通る。
    const result = mutateCollection(
      action === 'add'
        ? { type: 'add-favorite', record: makeRecord(2) }
        : { type: 'remove-favorite', hex: first.hex },
      provide,
    );
    // Assert: hook が誤って反映しないよう、未保存のお気に入り更新案は返さない。
    expect(result).toEqual({ status: 'unavailable' });
    expect(values.get(storageKeys.favorites)).toBe(before);
  });

  it.each(['append-history', 'add-favorite', 'remove-favorite', 'clear-history'] as const)(
    '%s は破損データを上書き・削除しない',
    (type) => {
      // Arrange: 操作確定直前の読み直しで破損が判明する条件。
      const { values, port, provide } = setup();
      const raw = '{';
      values.set(storageKeys.history, raw);
      values.set(storageKeys.favorites, raw);
      // Act: 種別ごとに必要な引数を渡す。
      const record = makeRecord(1);
      const operation =
        type === 'remove-favorite'
          ? { type, hex: record.hex }
          : type === 'clear-history'
            ? { type }
            : { type, record };
      const result = mutateCollection(operation, provide);
      // Assert: Clear であっても通常操作から保護領域を消さない。
      expect(result).toEqual({ status: 'protected', raw });
      expect(port.setItem).not.toHaveBeenCalled();
      expect(port.removeItem).not.toHaveBeenCalled();
    },
  );
});

describe('確認後の削除', () => {
  it('Clear は履歴キーだけを削除する', () => {
    // Arrange: 他方の領域と他アプリ相当の値も同じ保存オブジェクトに置く。
    const { values, port, provide } = setup();
    const favorite = stored([makeRecord(1)]);
    values.set(storageKeys.history, favorite);
    values.set(storageKeys.favorites, favorite);
    values.set('unrelated', 'keep');
    // Act: 確認済みの通常削除。
    expect(mutateCollection({ type: 'clear-history' }, provide)).toMatchObject({
      status: 'saved',
      items: [],
    });
    // Assert: clear() のない境界を使い、指定キーだけを削除したことを確認する。
    expect(values.has(storageKeys.history)).toBe(false);
    expect(values.get(storageKeys.favorites)).toBe(favorite);
    expect(values.get('unrelated')).toBe('keep');
    expect(port.removeItem).toHaveBeenCalledExactlyOnceWith(storageKeys.history);
  });

  it('Clear の削除失敗を通知する', () => {
    // Arrange: 削除 API の例外を再現する。
    const { values, port, provide } = setup();
    const before = stored([makeRecord(1)]);
    values.set(storageKeys.history, before);
    vi.mocked(port.removeItem).mockImplementation(() => {
      throw new Error('remove failed');
    });
    // Act + Assert: UI は履歴を維持し、以後のタブ内利用へ移れる。
    expect(mutateCollection({ type: 'clear-history' }, provide)).toEqual({ status: 'unavailable' });
    expect(values.get(storageKeys.history)).toBe(before);
  });

  it.each(['history', 'favorites'] as const)('Reset は確認済みの %s キーだけを削除する', (kind) => {
    // Arrange: 両方を破損させても、承認された片方だけを対象にする。
    const { values, port, provide } = setup();
    values.set(storageKeys.history, '{');
    values.set(storageKeys.favorites, '{');
    values.set('unrelated', 'keep');
    // Act: 生文字列の一致を確認してから削除する。
    expect(resetCollection(kind, '{', provide)).toEqual({ status: 'saved' });
    // Assert: 他方の保存内容や他アプリ相当の値を変更しない。
    expect(values.has(storageKeys[kind])).toBe(false);
    expect(values.size).toBe(2);
    expect(values.get('unrelated')).toBe('keep');
    expect(port.removeItem).toHaveBeenCalledExactlyOnceWith(storageKeys[kind]);
  });

  it.each([null, '{changed', stored([makeRecord(1)]), stored([])])(
    'Reset 確認後の内容変更を検出する: %s',
    (latest) => {
      // Arrange: 確認時の破損文字列から、削除・別の破損・正常化・空への変化を再現する。
      const { values, port, provide } = setup();
      if (latest !== null) values.set(storageKeys.history, latest);
      // Act + Assert: 最新の内容まで削除する承認には拡張しない。
      expect(resetCollection('history', '{', provide)).toEqual({ status: 'changed' });
      expect(port.removeItem).not.toHaveBeenCalled();
      expect(values.get(storageKeys.history) ?? null).toBe(latest);
    },
  );

  it('正常データは文字列が一致しても Reset で削除しない', () => {
    // Arrange: 呼び出し側の誤りにも備え、保護対象かを保存境界で再検証する。
    const { values, port, provide } = setup();
    const normal = stored([]);
    values.set(storageKeys.history, normal);
    // Act + Assert: Reset は破損・未対応領域の復旧に限定する。
    expect(resetCollection('history', normal, provide)).toEqual({ status: 'changed' });
    expect(port.removeItem).not.toHaveBeenCalled();
  });

  it.each(['getItem', 'removeItem'] as const)('Reset の %s 例外を成功扱いにしない', (method) => {
    // Arrange: 読み直しまたは対象削除の失敗。
    const { values, port, provide } = setup();
    values.set(storageKeys.history, '{');
    vi.mocked(port[method]).mockImplementation(() => {
      throw new Error('blocked');
    });
    // Act + Assert: hook は保護状態を維持できる。
    expect(resetCollection('history', '{', provide)).toEqual({ status: 'unavailable' });
    expect(values.get(storageKeys.history)).toBe('{');
  });
});
