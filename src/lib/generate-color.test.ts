import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateColor } from './generate-color';

const request = Object.freeze({ timestamp: 1792335600000, sequence: 1 });
const knownHash = '633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab';
const knownDigest = Uint8Array.from(knownHash.match(/../g) ?? [], (byte) =>
  Number.parseInt(byte, 16),
).buffer;
const otherDigest = new ArrayBuffer(32);
const recordId = '00000000-0000-4000-8000-000000000001';
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('寒色の生成', () => {
  it('標準の Web Crypto で技術設計の既知値と UUID を生成する', async () => {
    const record = await generateColor(request);
    expect(record).toMatchObject({
      generatedAt: 1792335600000,
      sequence: 1,
      attempt: 0,
      hash: knownHash,
      hsl: { h: 207, s: 77, l: 50 },
      hex: '#1D89E2',
    });
    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('UUID を固定しても実際の SHA-256 と生成記録が一致する', async () => {
    const createId = vi.fn(() => recordId);
    await expect(generateColor(request, { createId })).resolves.toEqual({
      id: recordId,
      generatedAt: 1792335600000,
      sequence: 1,
      attempt: 0,
      hash: knownHash,
      hsl: { h: 207, s: 77, l: 50 },
      hex: '#1D89E2',
    });
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('比較対象がなければ最初の候補を採用する', async () => {
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = vi.fn(() => recordId);
    const record = await generateColor(request, { digest, createId });
    expect(record.attempt).toBe(0);
    expect(digest.mock.calls).toEqual([[expectedSeeds[0]]]);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('同じミリ秒の要求を連番で区別し、入力を変更しない', async () => {
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = () => recordId;
    const first = await generateColor(request, { digest, createId });
    const second = await generateColor({ ...request, sequence: 2 }, { digest, createId });
    expect(digest.mock.calls).toEqual([
      ['rccg:v1:1792335600000:1:0'],
      ['rccg:v1:1792335600000:2:0'],
    ]);
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
    expect(request).toEqual({ timestamp: 1792335600000, sequence: 1 });
  });

  it('異なる比較対象なら再試行しない', async () => {
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const record = await generateColor(
      { ...request, previousHex: '#16694E' },
      { digest, createId: () => recordId },
    );
    expect(record.hex).toBe('#1D89E2');
    expect(record.attempt).toBe(0);
    expect(digest).toHaveBeenCalledTimes(1);
  });

  it('衝突時は日時と連番を固定し、attempt だけを増やす', async () => {
    const digest = vi
      .fn<(seed: string) => Promise<ArrayBuffer>>()
      .mockResolvedValueOnce(knownDigest)
      .mockResolvedValueOnce(otherDigest);
    const createId = vi.fn(() => recordId);
    const record = await generateColor(
      { ...request, previousHex: '#1D89E2' },
      { digest, createId },
    );
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
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>();
    for (let attempt = 0; attempt < 7; attempt += 1) {
      digest.mockResolvedValueOnce(knownDigest);
    }
    digest.mockResolvedValueOnce(otherDigest);
    const createId = vi.fn(() => recordId);
    const record = await generateColor(
      { ...request, previousHex: '#1D89E2' },
      { digest, createId },
    );
    expect(record.attempt).toBe(7);
    expect(record.hex).toBe('#16694E');
    expect(digest.mock.calls.map(([seed]) => seed)).toEqual(expectedSeeds);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('8 候補すべての衝突で失敗し、UUID を作らない', async () => {
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = vi.fn(() => recordId);
    await expect(
      generateColor({ ...request, previousHex: '#1D89E2' }, { digest, createId }),
    ).rejects.toThrow('Could not generate a different color after 8 attempts.');
    expect(digest.mock.calls.map(([seed]) => seed)).toEqual(expectedSeeds);
    expect(createId).not.toHaveBeenCalled();
  });

  it('digest の失敗を再試行せず、その例外を返す', async () => {
    const failure = new Error('Digest unavailable');
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockRejectedValue(failure);
    const createId = vi.fn(() => recordId);
    await expect(generateColor(request, { digest, createId })).rejects.toBe(failure);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(createId).not.toHaveBeenCalled();
  });

  it('衝突後に digest が失敗した場合も次の候補を試さない', async () => {
    const failure = new Error('Digest interrupted');
    const digest = vi
      .fn<(seed: string) => Promise<ArrayBuffer>>()
      .mockResolvedValueOnce(knownDigest)
      .mockRejectedValueOnce(failure);
    const createId = vi.fn(() => recordId);
    await expect(
      generateColor({ ...request, previousHex: '#1D89E2' }, { digest, createId }),
    ).rejects.toBe(failure);
    expect(digest).toHaveBeenCalledTimes(2);
    expect(createId).not.toHaveBeenCalled();
  });

  it.each([0, 12, 31, 33])('不正な %i バイトの digest から記録を作らない', async (length) => {
    const digest = vi
      .fn<(seed: string) => Promise<ArrayBuffer>>()
      .mockResolvedValue(new ArrayBuffer(length));
    const createId = vi.fn(() => recordId);
    await expect(generateColor(request, { digest, createId })).rejects.toBeInstanceOf(RangeError);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(createId).not.toHaveBeenCalled();
  });

  it('UUID の生成が失敗した場合は記録を返さない', async () => {
    const failure = new Error('UUID unavailable');
    const digest = vi.fn<(seed: string) => Promise<ArrayBuffer>>().mockResolvedValue(knownDigest);
    const createId = vi.fn(() => {
      throw failure;
    });
    await expect(generateColor(request, { digest, createId })).rejects.toBe(failure);
    expect(digest).toHaveBeenCalledTimes(1);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it('Web Crypto が利用できなければ代替の乱数生成へ切り替えず失敗する', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(generateColor(request)).rejects.toBeInstanceOf(TypeError);
  });
});
