import type { ColorRecord } from './types';

const collectionLimit = 20;

type AddFavoriteResult = {
  status: 'added' | 'duplicate' | 'full';
  items: ColorRecord[];
};

type RemoveFavoriteResult = {
  status: 'removed' | 'not-found';
  items: ColorRecord[];
};

export function appendHistory(history: readonly ColorRecord[], record: ColorRecord): ColorRecord[] {
  return [record, ...history].slice(0, collectionLimit);
}

export function addFavorite(
  favorites: readonly ColorRecord[],
  record: ColorRecord,
): AddFavoriteResult {
  // 満杯でも登録済みの色は「重複」とし、最初の記録と登録位置を維持する。
  if (favorites.some((favorite) => favorite.hex === record.hex)) {
    return { status: 'duplicate', items: [...favorites] };
  }
  if (favorites.length >= collectionLimit) {
    return { status: 'full', items: [...favorites] };
  }

  // 履歴や呼び出し側の記録が変わっても、登録時の生成情報を保持する。
  const snapshot: ColorRecord = { ...record, hsl: { ...record.hsl } };
  return { status: 'added', items: [snapshot, ...favorites] };
}

export function removeFavorite(
  favorites: readonly ColorRecord[],
  hex: string,
): RemoveFavoriteResult {
  const items = favorites.filter((favorite) => favorite.hex !== hex);
  return { status: items.length === favorites.length ? 'not-found' : 'removed', items };
}
