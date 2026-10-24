import { describe, expect, it } from 'vitest';
import { getUiState } from './ui-state';
import type { UiState, UiStateInput } from './ui-state';

// 色と履歴があり、お気に入りは空、両領域を利用できる状態を比較の基準にする。
const normal: UiStateInput = {
  hasColor: true,
  isGenerating: false,
  isFavorite: false,
  favoriteCount: 0,
  historyCount: 1,
  historyStorage: 'ready',
  favoriteStorage: 'ready',
};

/** 各行では変える条件と検証対象だけを明示し、無関係な値の繰り返しを減らす。 */
type Case = {
  name: string;
  input: Partial<UiStateInput>;
  expected: Partial<UiState>;
};

// 期待値は画面設計の操作可否から直接指定する。実装と同じ条件式で期待値を計算しない。
const cases: Case[] = [
  {
    name: '通常は生成・コピー・選択・登録・履歴削除が可能',
    input: {},
    expected: {
      canGenerate: true,
      canCopy: true,
      canSelect: true,
      canAddFavorite: true,
      canRemoveFavorite: false,
      canClearHistory: true,
      canResetHistory: false,
      canResetFavorites: false,
    },
  },
  {
    name: '初回失敗で色がなくても再生成と保存済み一覧の選択が可能',
    input: { hasColor: false },
    expected: { canGenerate: true, canCopy: false, canSelect: true, canAddFavorite: false },
  },
  {
    name: '色のない初回生成中は生成・コピー・選択・保存変更が不可',
    input: { hasColor: false, isGenerating: true },
    expected: {
      canGenerate: false,
      canCopy: false,
      canSelect: false,
      canAddFavorite: false,
      canRemoveFavorite: false,
      canClearHistory: false,
    },
  },
  {
    name: '再生成中も現在色のコピーは可能で、選択・保存変更は不可',
    input: { isGenerating: true, isFavorite: true, favoriteCount: 1 },
    expected: {
      canGenerate: false,
      canCopy: true,
      canSelect: false,
      canAddFavorite: false,
      canRemoveFavorite: false,
      canClearHistory: false,
    },
  },
  {
    name: '19 色なら未登録色を追加できる',
    input: { favoriteCount: 19 },
    expected: { canAddFavorite: true },
  },
  {
    name: '20 色なら未登録色を追加できない',
    input: { favoriteCount: 20 },
    expected: { canAddFavorite: false, canRemoveFavorite: false },
  },
  {
    name: '20 色でも登録済み色は解除できる',
    input: { favoriteCount: 20, isFavorite: true },
    expected: { canAddFavorite: false, canRemoveFavorite: true },
  },
  {
    name: 'お気に入り利用不可では変更を止め、再表示と履歴削除は許可する',
    input: { favoriteStorage: 'unavailable', isFavorite: true, favoriteCount: 1 },
    expected: {
      canAddFavorite: false,
      canRemoveFavorite: false,
      canSelect: true,
      canClearHistory: true,
      canResetFavorites: false,
    },
  },
  {
    name: 'お気に入り破損保護では通常変更を止め、対象の Reset を許可する',
    input: { favoriteStorage: 'protected', isFavorite: true, favoriteCount: 1 },
    expected: { canRemoveFavorite: false, canResetFavorites: true, canResetHistory: false },
  },
  {
    name: 'お気に入り利用不可では未登録色の追加も不可',
    input: { favoriteStorage: 'unavailable' },
    expected: { canAddFavorite: false },
  },
  {
    name: '履歴利用不可でもタブ内の履歴削除とお気に入り登録は可能',
    input: { historyStorage: 'unavailable' },
    expected: { canClearHistory: true, canAddFavorite: true, canResetHistory: false },
  },
  {
    name: '履歴破損保護では Clear を止め、対象の Reset と他領域の操作を許可する',
    input: { historyStorage: 'protected' },
    expected: { canClearHistory: false, canResetHistory: true, canAddFavorite: true },
  },
  {
    name: '空の履歴は Clear できない',
    input: { historyCount: 0 },
    expected: { canClearHistory: false },
  },
  {
    name: '生成中は破損領域の Reset も不可',
    input: { isGenerating: true, historyStorage: 'protected', favoriteStorage: 'protected' },
    expected: { canResetHistory: false, canResetFavorites: false },
  },
];

describe('画面設計に基づく操作可否', () => {
  // it.each は表の各行を独立したテストとして実行する。失敗名に再現条件を含める。
  it.each(cases)('$name', ({ input, expected }) => {
    // Arrange（準備）: 正常状態へ、その行で再現する条件だけを重ねる。
    const state = { ...normal, ...input };
    // Act（実行）: 生成・保存は呼ばず、表示の入口に必要な判定だけを行う。
    const actual = getUiState(state);
    // Assert（検証）: 部分一致で、この条件で特に守るべき操作可否を確認する。
    expect(actual).toMatchObject(expected);
  });
});
