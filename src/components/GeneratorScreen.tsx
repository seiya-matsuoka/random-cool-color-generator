import { useRef } from 'react';
import type { ColorRecord } from '../lib/types';
import { ColorDisplay } from './ColorDisplay';
import type { CodeFormat } from './ColorDisplay';
import { ConfirmDialog } from './ConfirmDialog';
import type { Confirmation } from './ConfirmDialog';
import { Notice } from './Notice';
import type { NoticeProps } from './Notice';
import { RecordList } from './RecordList';
import { getUiState } from './ui-state';
import type { StorageState } from './ui-state';

type GeneratorScreenProps = {
  record: ColorRecord | null;
  generatedAtLabel: string;
  history: readonly ColorRecord[];
  favorites: readonly ColorRecord[];
  isGenerating: boolean;
  historyStorage: StorageState;
  favoriteStorage: StorageState;
  notification: Pick<NoticeProps, 'tone' | 'message' | 'live'> | null;
  /** 読み込み時の調整は操作通知と独立させ、両領域の案内が同時にあっても欠けないようにする。 */
  storageNotices?: { history?: string; favorites?: string };
  confirmation: Confirmation | null;
  onGenerate: () => void;
  onCopy: (format: CodeFormat, text: string) => void;
  onSelect: (record: ColorRecord) => void;
  onAddFavorite: (record: ColorRecord) => void;
  onRemoveFavorite: (hex: string) => void;
  onClearHistory: () => void;
  onReset: (target: 'history' | 'favorites') => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 1 ページの配置を props だけで組み立てる。アプリの hook や Story の固定データは import しない。
 * 配列の更新・保存・生成・非同期の結果調整は、フェーズ 4 の呼び出し側に残す。
 */
export function GeneratorScreen(props: GeneratorScreenProps) {
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const favoritesHeadingRef = useRef<HTMLHeadingElement>(null);
  const favoriteHexes = props.favorites.map((record) => record.hex);
  const isFavorite = props.record !== null && favoriteHexes.includes(props.record.hex);
  const state = getUiState({
    hasColor: props.record !== null,
    isGenerating: props.isGenerating,
    isFavorite,
    favoriteCount: props.favorites.length,
    historyCount: props.history.length,
    historyStorage: props.historyStorage,
    favoriteStorage: props.favoriteStorage,
  });
  const listProps = {
    selectedRecordId: props.record?.id ?? null,
    selectedRecordHex: props.record?.hex ?? null,
    favoriteHexes,
    isGenerating: props.isGenerating,
    historyStorage: props.historyStorage,
    favoriteStorage: props.favoriteStorage,
    onSelect: props.onSelect,
    onAddFavorite: props.onAddFavorite,
    onRemoveFavorite: props.onRemoveFavorite,
    onClearHistory: props.onClearHistory,
  };

  return (
    <div className="min-h-svh bg-slate-50 px-4 py-8 font-sans text-slate-900 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            Random Cool Color Generator
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            A fresh cool color, with the details to keep it.
          </p>
        </header>
        <main className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
            <ColorDisplay
              record={props.record}
              generatedAtLabel={props.generatedAtLabel}
              isGenerating={props.isGenerating}
              isFavorite={isFavorite}
              favoriteCount={props.favorites.length}
              favoriteStorage={props.favoriteStorage}
              onGenerate={props.onGenerate}
              onCopy={props.onCopy}
              onAddFavorite={props.onAddFavorite}
              onRemoveFavorite={props.onRemoveFavorite}
            />
          </div>
          {/* 操作通知と保存領域ごとの継続案内は内容を分け、同一エラーを重ねて読み上げない。 */}
          <div className="space-y-3">
            {props.notification && <Notice {...props.notification} />}
            {props.storageNotices?.history && (
              <Notice tone="warning" message={props.storageNotices.history} />
            )}
            {props.storageNotices?.favorites && (
              <Notice tone="warning" message={props.storageNotices.favorites} />
            )}
            {props.historyStorage === 'unavailable' && (
              <Notice
                tone="warning"
                message="History could not be saved. New history is available in this tab until you reload."
              />
            )}
            {props.historyStorage === 'protected' && (
              <Notice
                tone="warning"
                message="Saved history could not be read. Reset it to enable saving again. New history is available only in this tab."
                actionLabel="Reset history"
                actionDisabled={!state.canResetHistory}
                onAction={() => props.onReset('history')}
              />
            )}
            {props.favoriteStorage === 'unavailable' && (
              <Notice
                tone="warning"
                message="Could not save favorites. Your favorites were not changed. Check your browser settings or reload to try again."
              />
            )}
            {props.favoriteStorage === 'protected' && (
              <Notice
                tone="warning"
                message="Saved favorites could not be read. Reset them to enable saving again."
                actionLabel="Reset favorites"
                actionDisabled={!state.canResetFavorites}
                onAction={() => props.onReset('favorites')}
              />
            )}
          </div>
          <RecordList
            {...listProps}
            kind="history"
            records={props.history}
            headingRef={historyHeadingRef}
          />
          <RecordList
            {...listProps}
            kind="favorites"
            records={props.favorites}
            headingRef={favoritesHeadingRef}
          />
        </main>
        <footer className="mt-8 max-w-3xl text-xs leading-6 text-slate-600">
          History and favorites are saved in this browser and may be lost if browser data is
          cleared. This app does not send generation records to external services.
        </footer>
      </div>
      <ConfirmDialog
        open={props.confirmation !== null}
        title={props.confirmation?.title ?? ''}
        description={props.confirmation?.description ?? ''}
        confirmLabel={props.confirmation?.confirmLabel ?? 'Confirm'}
        targetHex={props.confirmation?.targetHex}
        fallbackFocusRef={
          props.confirmation?.focusTarget === 'favorites' ? favoritesHeadingRef : historyHeadingRef
        }
        onConfirm={props.onConfirm}
        onCancel={props.onCancel}
      />
    </div>
  );
}
