import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatGeneratedAt } from './date-time';

// TZ はこのテストプロセス内だけの設定。OS 設定を変えず、他のケースへも持ち越さない。
afterEach(() => vi.unstubAllEnvs());

describe('生成日時の表示', () => {
  const cases = [
    ['Asia/Tokyo', 1792335600000, '2026-10-19 00:00:00.000 UTC+09:00'],
    ['UTC', 1792335600123, '2026-10-18 15:00:00.123 UTC+00:00'],
    ['Asia/Kathmandu', 1792335600007, '2026-10-18 20:45:00.007 UTC+05:45'],
    ['America/St_Johns', 1767225600000, '2025-12-31 20:30:00.000 UTC-03:30'],
    // 同じ表示環境でも、夏時間の値は「現在」ではなく対象の日時から求める。
    ['America/New_York', 1767225600000, '2025-12-31 19:00:00.000 UTC-05:00'],
    ['America/New_York', 1782864000000, '2026-06-30 20:00:00.000 UTC-04:00'],
    ['UTC', 0, '1970-01-01 00:00:00.000 UTC+00:00'],
  ] as const;
  it.each(cases)('%s の固定時刻 %i を整形する', (timezone, timestamp, expected) => {
    // Arrange: ロケール文字列に依存しない期待値と、表示環境だけを固定する。
    vi.stubEnv('TZ', timezone);
    // Act + Assert: ミリ秒・符号・分単位のオフセットと日付跨ぎを確認する。
    expect(formatGeneratedAt(timestamp)).toBe(expected);
  });
});
