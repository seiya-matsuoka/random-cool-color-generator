import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateColor } from './generate-color';

// 現在時刻を取得せず、技術設計のシードに対応する日時と連番を全ケースの基準にする。
// Object.freeze は共有の入力を書き換える誤りを実行時に検出する。ここでは各プロパティも数値だけである。
const request = Object.freeze({ timestamp: 1792335600000, sequence: 1 });
const knownHash = '633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab';
// 既知のハッシュを 2 桁ずつバイトへ戻す。生成関数から期待値を作らず、設計の固定値と照合する。
const knownDigest = Uint8Array.from(knownHash.match(/../g) ?? [], (byte) =>
  Number.parseInt(byte, 16),
).buffer;
// 全バイト 0 は HEX #16694E に対応する。衝突後に必ず異なる色となる候補を用意する。
const otherDigest = new ArrayBuffer(32);
// UUID の具体値が検証に必要なケースだけ、この固定 ID を返す関数へ差し替える。
const recordId = '00000000-0000-4000-8000-000000000001';
// 実装と同じループや補間で期待値を再生成せず、仕様のシード 8 個を独立した一覧として保持する。
const expectedSeeds = [
  'rccg:v1:1792335600000:1:0',
  'rccg:v1:1792335600000:1:1',
  'rccg:v1:1792335600000:1:2',
  'rccg:v1:1792335600000:1:3',
  'rccg:v1:1792335600000:1:4',
  'rccg:v1:1792335600000:1:5',
  'rccg:v1:1792335600000:1:6',
  'rccg:v1:1792335600000:1:7',
];

// afterEach は各ケースの終了後に動く後始末。グローバルの差し替えや復元対象のモックを次へ持ち越さない。
// vi.fn は各ケースで作り直しており、呼び出し履歴や返却値の設定をケース間で共有しない。
afterEach(() => {
  vi.restoreAllMocks();
  // stubGlobal による crypto の差し替えは、モックの復元とは別に解除する必要がある。
  vi.unstubAllGlobals();
});

describe('寒色の生成', () => {
  it('標準の Web Crypto で技術設計の既知値と UUID を生成する', async () => {
    // Arrange（準備）: 固定の要求を使い、ダイジェストも UUID も標準の API のまま実行する。
    // Act（実行）: await で非同期の生成が完了してから、返された記録を調べる。
    const record = await generateColor(request);
    // Assert（検証）: 決定的な生成情報を部分一致で確認し、毎回変わる ID は別に形式を検証する。
    expect(record).toMatchObject({
      generatedAt: 1792335600000,
      sequence: 1,
      attempt: 0,
      hash: knownHash,
      hsl: { h: 207, s: 77, l: 50 },
      hex: '#1D89E2',
    });
    // UUID v4 の桁数・区切り・バージョンなどの形式を確認し、偶然生成された具体値には依存しない。
    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('UUID を固定しても実際の SHA-256 と生成記録が一致する', async () => {
    // Arrange（準備）: vi.fn は呼び出し回数を記録できる関数。ここでは ID の生成だけを固定する。
    const createId = vi.fn(() => recordId);
    // Act + Assert（実行・検証）: 本物の SHA-256 を通した記録全体を固定値と比較する。
    // resolves は Promise の成功値を検証する。検証完了まで待つため、expect 全体にも await を付ける。
    await expect(generateColor(request, { createId })).resolves.toEqual({
      id: recordId,
      generatedAt: 1792335600000,
      sequence: 1,
      attempt: 0,
      hash: knownHash,
      hsl: { h: 207, s: 77, l: 50 },
      hex: '#1D89E2',
    });
    // 成功した記録 1 件に対して、ID の生成も 1 回だけ行う。
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('比較対象がなければ最初の候補を採用する', async () => {
    // Arrange（準備）: ここからの制御のテストでは digest を置き換え、候補を偶然に左右されずに決める。
    // <...> はモック関数の型を指定し、mockResolvedValue は指定値で成功する Promise を返すようにする。
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = vi.fn(() => recordId);
    // Act（実行）: previousHex を省略して生成する。
    const record = await generateColor(request, { digest, createId });
    // Assert（検証）: 初回の候補で成功し、正しいシードと 1 回だけの ID 生成を確認する。
    expect(record.attempt).toBe(0);
    // mock.calls は「各呼び出しの引数配列」の一覧。1 回・1 引数でも二重の配列となる。
    expect(digest.mock.calls).toEqual([[expectedSeeds[0]]]);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('同じミリ秒の要求を連番で区別し、入力を変更しない', async () => {
    // Arrange（準備）: digest の出力はあえて同じにし、色の違いではなく渡されたシードを検証する。
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = () => recordId;
    // Act（実行）: 時刻を変えず、別の要求オブジェクトで連番だけを進める。
    const first = await generateColor(request, { digest, createId });
    const second = await generateColor({ ...request, sequence: 2 }, { digest, createId });
    // Assert（検証）: 連番がシードと記録に反映され、共有の元の要求は書き換えられていない。
    expect(digest.mock.calls).toEqual([
      ['rccg:v1:1792335600000:1:0'],
      ['rccg:v1:1792335600000:2:0'],
    ]);
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
    expect(request).toEqual({ timestamp: 1792335600000, sequence: 1 });
  });

  it('異なる比較対象なら再試行しない', async () => {
    // Arrange（準備）: 最初の候補は #1D89E2、比較対象は異なる #16694E とする。
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    // Act（実行）: 比較対象を指定して生成する。
    const record = await generateColor(
      { ...request, previousHex: '#16694E' },
      { digest, createId: () => recordId },
    );
    // Assert（検証）: 比較対象が存在するだけでは再試行せず、初回の候補を採用する。
    expect(record.hex).toBe('#1D89E2');
    expect(record.attempt).toBe(0);
    expect(digest).toHaveBeenCalledTimes(1);
  });

  it('衝突時は日時と連番を固定し、attempt だけを増やす', async () => {
    // Arrange（準備）: mockResolvedValueOnce を並べ、1 回目は衝突、2 回目は別の色を返す順序を作る。
    const digest = vi
      .fn<(seed: string) => Promise<ArrayBuffer>>()
      .mockResolvedValueOnce(knownDigest)
      .mockResolvedValueOnce(otherDigest);
    const createId = vi.fn(() => recordId);
    // Act（実行）: 1 回目の候補と同じ HEX を比較対象にする。
    const record = await generateColor(
      { ...request, previousHex: '#1D89E2' },
      { digest, createId },
    );
    // Assert（検証）: 2 回目の候補の値が記録され、日時・連番は変わらず、ID は成功時だけ作られる。
    expect(record).toMatchObject({
      id: recordId,
      generatedAt: 1792335600000,
      sequence: 1,
      attempt: 1,
      hash: '00'.repeat(32),
      hsl: { h: 160, s: 65, l: 25 },
      hex: '#16694E',
    });
    expect(digest.mock.calls).toEqual([[expectedSeeds[0]], [expectedSeeds[1]]]);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('7 回衝突しても 8 候補目が異なれば成功する', async () => {
    // Arrange（準備）: 上限の直前まで衝突を予約し、許される最後の 1 候補だけを別の色にする。
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>();
    for (let attempt = 0; attempt < 7; attempt += 1) {
      digest.mockResolvedValueOnce(knownDigest);
    }
    digest.mockResolvedValueOnce(otherDigest);
    const createId = vi.fn(() => recordId);
    // Act（実行）: 上限の候補まで進む要求を実行する。
    const record = await generateColor(
      { ...request, previousHex: '#1D89E2' },
      { digest, createId },
    );
    // Assert（検証）: 0 始まりの attempt は 7。8 候補目を試す前に打ち切る誤りを検出する。
    expect(record.attempt).toBe(7);
    expect(record.hex).toBe('#16694E');
    // 引数配列からシードだけを取り出し、候補数だけでなく全シードの値と順序も確認する。
    expect(digest.mock.calls.map(([seed]) => seed)).toEqual(expectedSeeds);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('8 候補すべての衝突で失敗し、UUID を作らない', async () => {
    // Arrange（準備）: 毎回同じダイジェストを返し、比較対象との衝突を必ず発生させる。
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = vi.fn(() => recordId);
    // Act + Assert（実行・検証）: rejects で Promise の失敗を待ち、上限到達の例外を確認する。
    await expect(
      generateColor({ ...request, previousHex: '#1D89E2' }, { digest, createId }),
    ).rejects.toThrow('Could not generate a different color after 8 attempts.');
    // 9 候補目へ進まず、採用されなかった候補には ID も割り当てていない。
    expect(digest.mock.calls.map(([seed]) => seed)).toEqual(expectedSeeds);
    expect(createId).not.toHaveBeenCalled();
  });

  it('digest の失敗を再試行せず、その例外を返す', async () => {
    // Arrange（準備）: mockRejectedValue で、API の計算自体が失敗する Promise を再現する。
    const failure = new Error('Digest unavailable');
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockRejectedValue(failure);
    const createId = vi.fn(() => recordId);
    // Act + Assert（実行・検証）: toBe で同じ例外オブジェクトかを確認し、別の例外への置き換えも検出する。
    await expect(generateColor(request, { digest, createId })).rejects.toBe(failure);
    // 衝突だけを再試行の対象とし、API の失敗では即座に中止する。
    expect(digest).toHaveBeenCalledTimes(1);
    expect(createId).not.toHaveBeenCalled();
  });

  it('衝突後に digest が失敗した場合も次の候補を試さない', async () => {
    // Arrange（準備）: 最初は衝突し、再試行の計算は失敗するという 2 段階の応答を設定する。
    const failure = new Error('Digest interrupted');
    const digest = vi
      .fn<(seed: string) => Promise<ArrayBuffer>>()
      .mockResolvedValueOnce(knownDigest)
      .mockRejectedValueOnce(failure);
    const createId = vi.fn(() => recordId);
    // Act + Assert（実行・検証）: 衝突の途中であっても、API の失敗をそのまま呼び出し側へ伝える。
    await expect(
      generateColor({ ...request, previousHex: '#1D89E2' }, { digest, createId }),
    ).rejects.toBe(failure);
    // 3 候補目を試さず、記録も成立しないため ID を作らない。
    expect(digest).toHaveBeenCalledTimes(2);
    expect(createId).not.toHaveBeenCalled();
  });

  // 空、HSL 分だけの長さ、32 バイトの直前・直後を選び、変換関数の拒否が生成処理にも伝わるかを確かめる。
  it.each([0, 12, 31, 33])('不正な %i バイトの digest から記録を作らない', async (length) => {
    // Arrange（準備）: API は成功した形で、不正な長さのバイト列を返す。
    const digest = vi
      .fn<(seed: string) => Promise<ArrayBuffer>>()
      .mockResolvedValue(new ArrayBuffer(length));
    const createId = vi.fn(() => recordId);
    // Act + Assert（実行・検証）: Promise の失敗理由が RangeError であり、再計算や ID 生成をしない。
    await expect(generateColor(request, { digest, createId })).rejects.toBeInstanceOf(RangeError);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(createId).not.toHaveBeenCalled();
  });

  it('UUID の生成が失敗した場合は記録を返さない', async () => {
    // Arrange（準備）: 色の計算は成功させ、最後の ID 生成だけが同期的に例外を投げるようにする。
    const failure = new Error('UUID unavailable');
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = vi.fn(() => {
      throw failure;
    });
    // Act + Assert（実行・検証）: async 関数内の同期例外も Promise の拒否となり、記録は返されない。
    await expect(generateColor(request, { digest, createId })).rejects.toBe(failure);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('Web Crypto が利用できなければ代替の乱数生成へ切り替えず失敗する', async () => {
    // Arrange（準備）: グローバルの crypto が存在しない環境を再現する。afterEach で元に戻す。
    vi.stubGlobal('crypto', undefined);
    // Act + Assert（実行・検証）: 標準 API を使う既定の経路が失敗し、別方式の記録を返さない。
    await expect(generateColor(request)).rejects.toBeInstanceOf(TypeError);
  });
});
