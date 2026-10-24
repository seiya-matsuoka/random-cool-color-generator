import { useId } from 'react';
import type { RefObject } from 'react';
import type { ColorRecord } from '../lib/types';
import { getUiState } from './ui-state';
import type { StorageState } from './ui-state';

type RecordListProps = {
  kind: 'history' | 'favorites';
  /** readonly は UI から配列を変更しないための型上の制約。実行時の凍結ではない。 */
  records: readonly ColorRecord[];
  selectedRecordId: string | null;
  favoriteHexes: readonly string[];
  isGenerating: boolean;
  historyStorage: StorageState;
  favoriteStorage: StorageState;
  /** 起点が削除された確認ダイアログから、この見出しへフォーカスを戻せるようにする。 */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onSelect: (record: ColorRecord) => void;
  onAddFavorite: (record: ColorRecord) => void;
  onRemoveFavorite: (hex: string) => void;
  onClearHistory: () => void;
};

/** 履歴とお気に入りは共通の行で表示するが、同一性・削除操作の違いは維持する。 */
export function RecordList({ headingRef, ...props }: RecordListProps) {
  const titleId = useId();
  const title = props.kind === 'history' ? 'History' : 'Favorites';
  const state = getUiState({
    hasColor: false,
    isGenerating: props.isGenerating,
    isFavorite: false,
    favoriteCount: props.favoriteHexes.length,
    historyCount: props.records.length,
    historyStorage: props.historyStorage,
    favoriteStorage: props.favoriteStorage,
  });

  return (
    <section
      aria-labelledby={titleId}
      className="relative rounded-2xl border border-slate-200 bg-white p-5"
    >
      <details className="group">
        <summary
          className={`min-h-11 cursor-pointer rounded-lg py-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-700 ${props.kind === 'history' ? 'pr-36' : ''}`}
        >
          <h2 ref={headingRef} id={titleId} tabIndex={-1} className="inline text-lg font-semibold">
            {title}{' '}
            <span className="text-sm font-normal text-slate-500">
              ({props.records.length} / 20)
            </span>
          </h2>
        </summary>
        {props.records.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            No {props.kind === 'history' ? 'history' : 'favorites'} yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {props.records.map((record) => {
              // 履歴は同じ HEX の別記録を含む。選択は ID、登録状態は HEX で判定する。
              const selected = props.selectedRecordId === record.id;
              const isFavorite = props.favoriteHexes.includes(record.hex);
              const rowState = getUiState({
                hasColor: true,
                isGenerating: props.isGenerating,
                isFavorite,
                favoriteCount: props.favoriteHexes.length,
                historyCount: props.records.length,
                historyStorage: props.historyStorage,
                favoriteStorage: props.favoriteStorage,
              });
              return (
                <li
                  key={record.id}
                  className={`flex min-w-0 flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${selected ? 'border-slate-500 bg-slate-50' : 'border-slate-200'}`}
                >
                  <button
                    type="button"
                    disabled={!rowState.canSelect}
                    aria-label={`Show color ${record.hex}, record ${record.sequence}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => props.onSelect(record)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span
                      aria-hidden="true"
                      style={{ backgroundColor: record.hex }}
                      className="size-10 shrink-0 rounded-lg border border-black/10"
                    />
                    <span className="min-w-0">
                      <code className="font-semibold">{record.hex}</code>
                      {selected && (
                        <span className="block text-xs text-slate-600">Current record</span>
                      )}
                    </span>
                  </button>
                  {/* 選択と登録・解除は兄弟の button とし、button の入れ子を作らない。 */}
                  <button
                    type="button"
                    disabled={isFavorite ? !rowState.canRemoveFavorite : !rowState.canAddFavorite}
                    aria-label={`${isFavorite ? 'Remove favorite' : 'Add to favorites'} ${record.hex}, record ${record.sequence}`}
                    onClick={() => {
                      if (isFavorite) props.onRemoveFavorite(record.hex);
                      else props.onAddFavorite(record);
                    }}
                    className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isFavorite ? 'Remove favorite' : 'Add to favorites'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </details>
      {props.kind === 'history' && (
        <button
          type="button"
          disabled={!state.canClearHistory}
          onClick={props.onClearHistory}
          className="absolute top-5 right-5 min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Clear history
        </button>
      )}
      {props.kind === 'favorites' && props.records.length >= 20 && (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Favorites are full. Remove a color to add another.
        </p>
      )}
    </section>
  );
}
