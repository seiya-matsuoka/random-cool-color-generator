import type { ColorRecord } from './types';

// 両一覧の上限は同じ 20 だが、上限到達時の扱いは履歴の自動切り詰めとお気に入りの拒否で異なる。
const collectionLimit = 20;

/** 操作の結果と次の一覧を返す。status の文字列リテラルの union 型で、結果の種類を限定する。 */
type AddFavoriteResult = {
  status: 'added' | 'duplicate' | 'full';
  items: ColorRecord[];
};

/** 解除対象が存在しない場合も例外にはせず、変更不要という結果を呼び出し側へ返す。 */
type RemoveFavoriteResult = {
  status: 'removed' | 'not-found';
  items: ColorRecord[];
};

/**
 * 成功した生成記録を先頭へ追加し、入力の順序を保ったまま直近 20 件へ切り詰める。
 * 同じ HEX の記録も別の生成として残し、生成日時による再ソートは行わない。
 * readonly は入力配列の変更を型検査で制限するもので、実行時の凍結や記録全体の複製ではない。
 * 既存の記録を変更せず、新しい配列を返す。保存や画面への反映は呼び出し側が担当する。
 */
export function appendHistory(history: readonly ColorRecord[], record: ColorRecord): ColorRecord[] {
  // 配列のスプレッドで先頭に追加し、slice の終端を 20 として 0〜19 番目だけを取り出す。
  return [record, ...history].slice(0, collectionLimit);
}

/**
 * HEX が未登録で空きがある場合に、元の生成情報のスナップショットを先頭へ登録する。
 * 入力は正規化済みの HEX を持つ、重複のない上限内の一覧を前提とする。
 * 戻り値は一覧の更新案であり、ブラウザへの保存の成功を意味するものではない。
 */
export function addFavorite(
  favorites: readonly ColorRecord[],
  record: ColorRecord,
): AddFavoriteResult {
  // ID が異なっても HEX が同じなら同じ色とする。
  // 満杯でも登録済みの色は「重複」とするため、件数より先に判定し、最初の記録と位置を維持する。
  if (favorites.some((favorite) => favorite.hex === record.hex)) {
    // 配列だけを複製する。既存の生成記録まで作り直す必要はなく、入力の配列も変更しない。
    return { status: 'duplicate', items: [...favorites] };
  }
  if (favorites.length >= collectionLimit) {
    // 履歴と異なり、空きを作るために既存のお気に入りを自動削除しない。
    return { status: 'full', items: [...favorites] };
  }

  // オブジェクトのスプレッドは浅いコピーなので、ネストした hsl も別のオブジェクトへ複製する。
  // 新しく登録する記録を元の記録から独立させ、後から元の hsl が変わっても登録時の値を保持する。
  const snapshot: ColorRecord = { ...record, hsl: { ...record.hsl } };
  return { status: 'added', items: [snapshot, ...favorites] };
}

/**
 * 指定した HEX のお気に入りを除き、残りの登録順を維持した新しい配列を返す。
 * 入力の HEX と一覧が妥当であることを前提とし、履歴や現在表示中の記録には触れない。
 * 対象がなければ not-found とする。確認ダイアログや保存は呼び出し側の責務とする。
 */
export function removeFavorite(
  favorites: readonly ColorRecord[],
  hex: string,
): RemoveFavoriteResult {
  // filter は元の配列を変更せず、条件を満たす既存の記録を同じ順序で新しい配列へ残す。
  const items = favorites.filter((favorite) => favorite.hex !== hex);
  return { status: items.length === favorites.length ? 'not-found' : 'removed', items };
}
