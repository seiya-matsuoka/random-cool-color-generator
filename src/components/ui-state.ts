/** 保存処理の結果を表示するための分類。実際の読み書きや検証はフェーズ 4 の責務とする。 */
export type StorageState = 'ready' | 'unavailable' | 'protected';

/** 表示中の対象と一覧の状況。件数は呼び出し側が保持する配列から渡す。 */
export type UiStateInput = {
  hasColor: boolean;
  isGenerating: boolean;
  isFavorite: boolean;
  favoriteCount: number;
  historyCount: number;
  historyStorage: StorageState;
  favoriteStorage: StorageState;
};

/** UI の入口を制限する値。保存の成功や、非同期処理の再入防止を保証するものではない。 */
export type UiState = {
  canGenerate: boolean;
  canCopy: boolean;
  canSelect: boolean;
  canAddFavorite: boolean;
  canRemoveFavorite: boolean;
  canClearHistory: boolean;
  canResetHistory: boolean;
  canResetFavorites: boolean;
};

/** props だけから操作可否を求める。副作用を持たず、Node 環境でも検証できる。 */
export function getUiState(input: UiStateInput): UiState {
  const idle = !input.isGenerating;
  const canChangeFavorites = idle && input.hasColor && input.favoriteStorage === 'ready';

  return {
    canGenerate: idle,
    // 再生成では直前の色を残すため、コピーは処理中フラグに連動させない。
    canCopy: input.hasColor,
    canSelect: idle,
    canAddFavorite: canChangeFavorites && !input.isFavorite && input.favoriteCount < 20,
    // 上限は追加だけの制約。満杯から空きを作る解除操作を止めない。
    canRemoveFavorite: canChangeFavorites && input.isFavorite,
    // 利用不可ならタブ内の履歴を削除できるが、破損した保存内容は Reset に集約する。
    canClearHistory: idle && input.historyCount > 0 && input.historyStorage !== 'protected',
    canResetHistory: idle && input.historyStorage === 'protected',
    canResetFavorites: idle && input.favoriteStorage === 'protected',
  };
}
