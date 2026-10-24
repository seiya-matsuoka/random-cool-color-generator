import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeFormat } from '../components/ColorDisplay';
import type { Confirmation } from '../components/ConfirmDialog';
import type { NoticeProps } from '../components/Notice';
import type { StorageState } from '../components/ui-state';
import { formatGeneratedAt } from '../lib/date-time';
import { generateColor } from '../lib/generate-color';
import { appendHistory } from '../lib/records';
import { mutateCollection, readCollection, resetCollection, storageKeys } from '../lib/storage';
import type { CollectionMutation, CollectionRead } from '../lib/storage';
import type { CollectionAdjustments, CollectionKind } from '../lib/storage-validation';
import type { ColorRecord } from '../lib/types';

/** 領域ごとの一覧と保存モード。保護対象 raw は UI へ渡さず、Reset の一致確認だけに使う。 */
type Region = {
  status: StorageState;
  items: ColorRecord[];
  raw?: string;
  notice?: string;
};
type Notification = Pick<NoticeProps, 'tone' | 'message' | 'live'>;

/** 表示文と実行対象を分離する。確認中に古い配列を捕捉した削除関数は保持しない。 */
type Pending =
  | { type: 'clear-history'; tabOnly: boolean }
  | { type: 'remove-favorite'; hex: string }
  | { type: 'reset'; target: CollectionKind; raw: string };
type Model = {
  record: ColorRecord | null;
  history: Region;
  favorites: Region;
  isGenerating: boolean;
  notification: Notification | null;
  pending: Pending | null;
};

/** state 初期化は純粋に行う。Strict Mode で再実行されても読み書き・生成は発生しない。 */
function initialModel(): Model {
  return {
    record: null,
    history: { status: 'ready', items: [] },
    favorites: { status: 'ready', items: [] },
    isGenerating: true,
    notification: null,
    pending: null,
  };
}

function adjustmentNotice(kind: CollectionKind, counts: CollectionAdjustments): string | undefined {
  return counts.invalid + counts.duplicate + counts.overflow > 0
    ? `Some saved ${kind} entries were skipped or adjusted.`
    : undefined;
}

/** 読めなくなった場合も、最後に正常に利用できた一覧は表示・タブ内履歴のために残す。 */
function regionFromRead(kind: CollectionKind, previous: Region, result: CollectionRead): Region {
  if (result.status === 'ready') {
    return {
      status: 'ready',
      items: result.items,
      notice: adjustmentNotice(kind, result.adjustments),
    };
  }
  return result.status === 'protected'
    ? { ...previous, status: 'protected', raw: result.raw }
    : { ...previous, status: 'unavailable' };
}

/** 確認の表示内容だけを UI へ渡す。実際の保存・削除は onConfirm が改めて判断する。 */
function confirmationFor(pending: Pending | null): Confirmation | null {
  if (!pending) return null;
  if (pending.type === 'clear-history') {
    return {
      title: 'Clear history?',
      confirmLabel: 'Clear history',
      focusTarget: 'history',
      description: pending.tabOnly
        ? 'Clear history in this tab only. Saved history could not be changed. Your current color and favorites will remain.'
        : 'Delete saved history. Your current color and favorites will remain.',
    };
  }
  if (pending.type === 'remove-favorite') {
    return {
      title: 'Remove favorite?',
      confirmLabel: 'Remove favorite',
      focusTarget: 'favorites',
      targetHex: pending.hex,
      description: 'Remove this color from favorites. Your current color and history will remain.',
    };
  }
  const history = pending.target === 'history';
  return {
    title: history ? 'Reset history?' : 'Reset favorites?',
    confirmLabel: history ? 'Reset history' : 'Reset favorites',
    focusTarget: pending.target,
    description: history
      ? 'Delete unreadable saved history and history in this tab. Your current color and favorites will remain.'
      : 'Delete unreadable saved favorites. Your current color and history will remain.',
  };
}

/**
 * 生成・保存と React の購読を調整するアプリ専用 hook。
 * state は描画用、ref は同一タスクの共有・同期的な再入防止・最新状態の参照に使い分ける。
 * UI や Story はこの hook を直接扱わず、App が返却値を props とコールバックへ接続する。
 */
export function useColorGenerator() {
  const [model, setModel] = useState(initialModel);
  const latest = useRef(initialModel());
  const mounted = useRef(false);
  const busy = useRef(true);
  const sequence = useRef(0);
  const generationId = useRef(0);
  const noticeId = useRef(0);
  const initialCommitted = useRef(false);
  const startup = useRef<{
    loaded: Promise<{ history: CollectionRead; favorites: CollectionRead }>;
    generated: Promise<ColorRecord>;
  } | null>(null);

  const publish = useCallback((patch: Partial<Model>) => {
    if (!mounted.current) return;
    // state 更新関数の中で保存しない。更新案を確定した後、同じ状態を ref と描画へ渡す。
    latest.current = { ...latest.current, ...patch };
    setModel(latest.current);
  }, []);
  const notify = useCallback(
    (tone: Notification['tone'], message: string) => {
      noticeId.current += 1;
      publish({ notification: { tone, message } });
    },
    [publish],
  );

  const commitGeneration = useCallback(
    (record: ColorRecord) => {
      const previous = latest.current.history;
      let history: Region;
      if (previous.status === 'ready') {
        const result = mutateCollection({ type: 'append-history', record });
        if (result.status === 'saved') {
          history = {
            status: 'ready',
            items: result.items,
            // 初回生成の即時保存で、起動時に検出した調整の案内を消してしまわない。
            notice: adjustmentNotice('history', result.adjustments) ?? previous.notice,
          };
        } else if (result.status === 'protected') {
          history = {
            ...previous,
            status: 'protected',
            raw: result.raw,
            items: appendHistory(previous.items, record),
          };
        } else if (result.status === 'unavailable') {
          history = {
            ...previous,
            status: 'unavailable',
            items: result.historyFallback ?? appendHistory(previous.items, record),
          };
        } else {
          // append-history は重複・満杯・対象消失を返さない。通常の保存結果の型を共用するための分岐。
          history = previous;
        }
      } else {
        // 保存不可・保護へ一度移ったら、再読み込みまたは明示 Reset まで通常保存を再試行しない。
        history = { ...previous, items: appendHistory(previous.items, record) };
      }
      busy.current = false;
      publish({ record, history, isGenerating: false });
    },
    [publish],
  );

  useEffect(() => {
    mounted.current = true;
    // effect ごとの購読を識別する。Strict Mode の古い購読は、次の setup があっても復活させない。
    let active = true;
    if (startup.current === null) {
      const loaded = Promise.resolve().then(() => ({
        history: readCollection('history'),
        favorites: readCollection('favorites'),
      }));
      const generated = loaded.then(({ history }) =>
        generateColor({
          timestamp: Date.now(),
          sequence: ++sequence.current,
          previousHex: history.status === 'ready' ? history.items[0]?.hex : undefined,
        }),
      );
      startup.current = { loaded, generated };
    }
    const task = startup.current;
    void task.loaded.then((loaded) => {
      if (!active) return;
      publish({
        history: regionFromRead('history', latest.current.history, loaded.history),
        favorites: regionFromRead('favorites', latest.current.favorites, loaded.favorites),
      });
    });
    void task.generated.then(
      (record) => {
        if (!active || initialCommitted.current) return;
        initialCommitted.current = true;
        // 初回の計算 Promise は共有するが、保存・描画は有効な購読先だけで一度確定する。
        commitGeneration(record);
      },
      () => {
        if (!active || initialCommitted.current) return;
        initialCommitted.current = true;
        busy.current = false;
        publish({ isGenerating: false });
        notify('error', 'Could not generate a color. Please try again.');
      },
    );

    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== storageKeys.history &&
        event.key !== storageKeys.favorites
      )
        return;
      try {
        if (event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
      for (const kind of ['history', 'favorites'] as const) {
        // key=null でも 2 キーだけを読み、sessionStorage や他アプリの値を列挙しない。
        if (
          (event.key === null || event.key === storageKeys[kind]) &&
          latest.current[kind].status === 'ready'
        ) {
          publish({ [kind]: regionFromRead(kind, latest.current[kind], readCollection(kind)) });
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      mounted.current = false;
      // Web Crypto の計算自体を中断したとは扱わない。購読を外し、完了後の保存・状態更新を止める。
      window.removeEventListener('storage', onStorage);
    };
  }, [commitGeneration, notify, publish]);

  const onGenerate = () => {
    if (!mounted.current || busy.current || latest.current.pending) return;
    busy.current = true;
    const requestId = ++generationId.current;
    noticeId.current += 1;
    publish({ isGenerating: true, notification: null });
    const request = {
      timestamp: Date.now(),
      sequence: ++sequence.current,
      // 初回失敗後の再実行も、表示色がなければ読み込めた履歴先頭と比較する。
      previousHex: latest.current.record?.hex ?? latest.current.history.items[0]?.hex,
    };
    void generateColor(request).then(
      (record) => {
        if (!mounted.current || requestId !== generationId.current) return;
        commitGeneration(record);
      },
      () => {
        if (!mounted.current || requestId !== generationId.current) return;
        busy.current = false;
        publish({ isGenerating: false });
        notify('error', 'Could not generate a color. Please try again.');
      },
    );
  };

  const onCopy = (format: CodeFormat, text: string) => {
    if (!mounted.current || latest.current.record === null) return;
    const requestId = ++noticeId.current;
    // ユーザー操作の呼び出し中に API を開始する。事前の await で操作の権限を失わないようにする。
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        if (mounted.current && requestId === noticeId.current)
          notify('success', `${format.toUpperCase()} copied.`);
      } catch {
        if (mounted.current && requestId === noticeId.current)
          notify('error', 'Could not copy. Select the code and copy it manually.');
      }
    })();
  };

  const applyFavoriteResult = (result: CollectionMutation, successMessage: string) => {
    const previous = latest.current.favorites;
    if (result.status === 'unavailable' || result.status === 'protected') {
      publish({
        favorites:
          result.status === 'protected'
            ? { ...previous, status: 'protected', raw: result.raw }
            : { ...previous, status: 'unavailable' },
      });
      // 継続案内は GeneratorScreen の領域別表示に任せ、同じ失敗を二重に読み上げない。
      return;
    }
    publish({
      favorites: {
        status: 'ready',
        items: result.items,
        notice: adjustmentNotice('favorites', result.adjustments),
      },
    });
    const message =
      result.status === 'duplicate'
        ? 'This color is already in favorites.'
        : result.status === 'full'
          ? 'Favorites are full. Remove a color to add another.'
          : result.status === 'not-found'
            ? 'This favorite was already removed. No changes were needed.'
            : successMessage;
    notify(result.status === 'full' ? 'warning' : 'success', message);
  };
  const onAddFavorite = (record: ColorRecord) => {
    if (
      !mounted.current ||
      busy.current ||
      latest.current.pending ||
      latest.current.favorites.status !== 'ready'
    )
      return;
    // 新しい保存操作の結果と、以前の成功や保留中コピーの通知を混同させない。
    noticeId.current += 1;
    publish({ notification: null });
    applyFavoriteResult(
      mutateCollection({ type: 'add-favorite', record }),
      'Color added to favorites.',
    );
  };
  const onSelect = (record: ColorRecord) => {
    if (!mounted.current || busy.current || latest.current.pending) return;
    noticeId.current += 1;
    publish({ record, notification: null });
  };
  const onRemoveFavorite = (hex: string) => {
    if (
      !mounted.current ||
      busy.current ||
      latest.current.pending ||
      latest.current.favorites.status !== 'ready'
    )
      return;
    publish({ pending: { type: 'remove-favorite', hex } });
  };
  const onClearHistory = () => {
    const history = latest.current.history;
    if (
      !mounted.current ||
      busy.current ||
      latest.current.pending ||
      history.status === 'protected' ||
      history.items.length === 0
    )
      return;
    publish({ pending: { type: 'clear-history', tabOnly: history.status === 'unavailable' } });
  };
  const onReset = (target: CollectionKind) => {
    const region = latest.current[target];
    if (
      !mounted.current ||
      busy.current ||
      latest.current.pending ||
      region.status !== 'protected' ||
      region.raw === undefined
    )
      return;
    publish({ pending: { type: 'reset', target, raw: region.raw } });
  };
  const onConfirm = () => {
    const pending = latest.current.pending;
    if (!mounted.current || busy.current || pending === null) return;
    // 同期的に確認対象を消費し、確定ボタンの二度押しでも同じ削除を繰り返さない。
    noticeId.current += 1;
    publish({ pending: null, notification: null });
    if (pending.type === 'remove-favorite') {
      if (latest.current.favorites.status !== 'ready') {
        notify('error', 'Favorites could not be changed. Review the storage notice.');
        return;
      }
      applyFavoriteResult(
        mutateCollection({ type: 'remove-favorite', hex: pending.hex }),
        'Favorite removed.',
      );
    } else if (pending.type === 'clear-history') {
      const history = latest.current.history;
      if (
        history.status === 'protected' ||
        pending.tabOnly !== (history.status === 'unavailable')
      ) {
        notify('error', 'History storage changed. Review the storage notice before clearing it.');
      } else if (pending.tabOnly) {
        publish({ history: { ...history, items: [] } });
        notify('success', 'History in this tab cleared. Saved history was not changed.');
      } else {
        const result = mutateCollection({ type: 'clear-history' });
        if (result.status === 'saved') {
          publish({ history: { status: 'ready', items: [] } });
          notify('success', 'History cleared.');
        } else if (result.status === 'protected' || result.status === 'unavailable') {
          publish({
            history:
              result.status === 'protected'
                ? { ...history, status: 'protected', raw: result.raw }
                : { ...history, status: 'unavailable' },
          });
        }
      }
    } else {
      const result = resetCollection(pending.target, pending.raw);
      if (result.status === 'saved') {
        publish({ [pending.target]: { status: 'ready', items: [] } });
        notify('success', `${pending.target === 'history' ? 'History' : 'Favorites'} reset.`);
      } else {
        // Reset の例外でも保護モードは変えない。変更検出時も自動復帰・最新データの削除をしない。
        notify(
          'error',
          result.status === 'changed'
            ? 'Saved data changed while you were confirming. Nothing was reset. Reload to review the latest data.'
            : 'Could not reset saved data. Nothing was changed. Please try again or reload.',
        );
      }
    }
  };

  return {
    record: model.record,
    generatedAtLabel: model.record ? formatGeneratedAt(model.record.generatedAt) : '',
    history: model.history.items,
    favorites: model.favorites.items,
    historyStorage: model.history.status,
    favoriteStorage: model.favorites.status,
    storageNotices: { history: model.history.notice, favorites: model.favorites.notice },
    isGenerating: model.isGenerating,
    notification: model.notification,
    confirmation: confirmationFor(model.pending),
    onGenerate,
    onCopy,
    onSelect,
    onAddFavorite,
    onRemoveFavorite,
    onClearHistory,
    onReset,
    onConfirm,
    onCancel: () => publish({ pending: null }),
  };
}
