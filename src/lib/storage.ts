import { addFavorite, appendHistory, removeFavorite } from './records';
import { validateCollection } from './storage-validation';
import type { ColorRecord, StoredCollection } from './types';
import type {
  CollectionAdjustments,
  CollectionKind,
  ValidatedCollection,
} from './storage-validation';

/** 保存領域の列挙・全消去を境界に含めず、必要な標準 API だけをテストで置き換える。 */
export type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type StorageProvider = () => StoragePort;

/** 任意のキーを受け取らず、この対応表から対象領域のキーを決定する。 */
export const storageKeys = {
  history: 'random-cool-color-generator:history',
  favorites: 'random-cool-color-generator:favorites',
} as const;

export type CollectionRead = ValidatedCollection | { status: 'unavailable' };
export type CollectionOperation =
  | { type: 'append-history'; record: ColorRecord }
  | { type: 'add-favorite'; record: ColorRecord }
  | { type: 'remove-favorite'; hex: string }
  | { type: 'clear-history' };

/**
 * saved だけが書き込み・削除の成功。重複・上限・対象消失は保存例外と区別する。
 * historyFallback は履歴保存失敗時のタブ内利用用であり、お気に入りの更新案は公開しない。
 */
export type CollectionMutation =
  | {
      status: 'saved' | 'duplicate' | 'full' | 'not-found';
      items: ColorRecord[];
      adjustments: CollectionAdjustments;
    }
  | { status: 'protected'; raw: string }
  | { status: 'unavailable'; historyFallback?: ColorRecord[] };
export type CollectionReset = { status: 'saved' | 'changed' | 'unavailable' };

/** localStorage のプロパティ取得時にも例外があり得るため、呼び出しを try 内へ遅延する。 */
export const browserStorage: StorageProvider = () => window.localStorage;

/** 各領域の読み込みは独立した結果とし、片方の例外で他方の起動を止めない。 */
export function readCollection(
  kind: CollectionKind,
  provide: StorageProvider = browserStorage,
): CollectionRead {
  try {
    return validateCollection(provide().getItem(storageKeys[kind]), kind);
  } catch {
    // 取得・読み取りの失敗は JSON 破損と区別する。利用不可に Reset を案内しない。
    return { status: 'unavailable' };
  }
}

/**
 * 最新の保存内容へ操作を適用し、永続化の結果を返す。画面の更新は hook の責務。
 * 新規 record は生成成功済み・検証済みを前提とし、ここでは保存済み一覧を再検証する。
 */
export function mutateCollection(
  operation: CollectionOperation,
  provide: StorageProvider = browserStorage,
): CollectionMutation {
  let historyFallback: ColorRecord[] | undefined;
  try {
    const storage = provide();
    const kind =
      operation.type === 'append-history' || operation.type === 'clear-history'
        ? 'history'
        : 'favorites';
    const key = storageKeys[kind];
    const latest = validateCollection(storage.getItem(key), kind);
    if (latest.status === 'protected') return latest;
    let items: ColorRecord[];
    if (operation.type === 'append-history') {
      items = appendHistory(latest.items, operation.record);
      historyFallback = items;
    } else if (operation.type === 'add-favorite') {
      const next = addFavorite(latest.items, operation.record);
      if (next.status !== 'added')
        return { status: next.status, items: next.items, adjustments: latest.adjustments };
      items = next.items;
    } else if (operation.type === 'remove-favorite') {
      const next = removeFavorite(latest.items, operation.hex);
      if (next.status === 'not-found')
        return { status: next.status, items: next.items, adjustments: latest.adjustments };
      items = next.items;
    } else {
      // 正常な履歴の全削除も、直前の読み直しで破損していないことを確かめてから行う。
      storage.removeItem(key);
      return { status: 'saved', items: [], adjustments: latest.adjustments };
    }
    const envelope: StoredCollection = { version: 1, items };
    storage.setItem(key, JSON.stringify(envelope));
    return { status: 'saved', items, adjustments: latest.adjustments };
  } catch {
    // 未保存のお気に入りは返さない。履歴だけは、読めた最新一覧と新規記録をタブ内へ残せる。
    return historyFallback ? { status: 'unavailable', historyFallback } : { status: 'unavailable' };
  }
}

/** 確認した破損データと一致する場合だけ削除する。正常化済みの最新データは削除しない。 */
export function resetCollection(
  kind: CollectionKind,
  expectedRaw: string,
  provide: StorageProvider = browserStorage,
): CollectionReset {
  try {
    const storage = provide();
    const key = storageKeys[kind];
    const raw = storage.getItem(key);
    // 確認後に正常化・削除・別の破損へ変わった場合も、削除の承認を最新内容へ拡張しない。
    if (raw !== expectedRaw || validateCollection(raw, kind).status !== 'protected')
      return { status: 'changed' };
    storage.removeItem(key);
    return { status: 'saved' };
  } catch {
    return { status: 'unavailable' };
  }
}
