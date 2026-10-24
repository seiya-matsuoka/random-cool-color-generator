import { useId } from 'react';
import { formatHsl, formatRgb, hexToRgb } from '../lib/color';
import type { ColorRecord } from '../lib/types';
import { ColorCode } from './ColorCode';
import { getUiState } from './ui-state';
import type { StorageState } from './ui-state';

/** 小文字は操作の識別子、画面上のラベルは HEX / RGB / HSL として使い分ける。 */
export type CodeFormat = 'hex' | 'rgb' | 'hsl';

type ColorDisplayProps = {
  /** null は初回生成中・初回失敗を表す。失敗の説明は通知コンポーネントで行う。 */
  record: ColorRecord | null;
  /** 日時の実際の整形は統合時に行う。Story にはミリ秒・UTC オフセット付きの固定文字列を渡す。 */
  generatedAtLabel: string;
  isGenerating: boolean;
  isFavorite: boolean;
  favoriteCount: number;
  favoriteStorage: StorageState;
  onGenerate: () => void;
  onCopy: (format: CodeFormat, text: string) => void;
  onAddFavorite: (record: ColorRecord) => void;
  onRemoveFavorite: (hex: string) => void;
};

/** 元の生成記録を表示する。変換済みの記録を使い、生成・保存・コピー API は呼び出さない。 */
export function ColorDisplay(props: ColorDisplayProps) {
  // useId は同時に複数の Story が描画されても、見出しの参照先が重複しない ID を作る。
  const titleId = useId();
  const { record, isGenerating, isFavorite } = props;
  const state = getUiState({
    hasColor: record !== null,
    isGenerating,
    isFavorite,
    favoriteCount: props.favoriteCount,
    favoriteStorage: props.favoriteStorage,
    historyCount: 0,
    historyStorage: 'ready',
  });

  return (
    <section aria-labelledby={titleId} aria-busy={isGenerating}>
      <h2
        id={titleId}
        className="mb-4 text-sm font-semibold tracking-widest text-slate-600 uppercase"
      >
        Current color
      </h2>
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-10">
        {/* 動的な HEX は静的解析で列挙できないため、Tailwind のクラスではなく style に渡す。 */}
        <div
          aria-hidden="true"
          style={{ backgroundColor: record?.hex }}
          className="aspect-square w-full rounded-2xl border border-black/10 bg-slate-200 shadow-inner"
        />
        <div className="min-w-0 space-y-5 self-center">
          {record ? (
            <>
              <ColorCode
                label="HEX"
                value={record.hex}
                disabled={!state.canCopy}
                onCopy={(text) => props.onCopy('hex', text)}
              />
              <p className="text-sm leading-6 wrap-anywhere text-slate-600">
                <span className="block font-medium text-slate-800">Generated at</span>
                <time dateTime={new Date(record.generatedAt).toISOString()}>
                  {props.generatedAtLabel}
                </time>
              </p>
            </>
          ) : (
            <p className="text-lg text-slate-600">No color to display yet.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!state.canGenerate}
              onClick={props.onGenerate}
              className="min-h-11 rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isGenerating ? 'Generating...' : 'Generate color'}
            </button>
            <button
              type="button"
              disabled={isFavorite ? !state.canRemoveFavorite : !state.canAddFavorite}
              onClick={() => {
                if (!record) return;
                if (isFavorite) props.onRemoveFavorite(record.hex);
                else props.onAddFavorite(record);
              }}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isFavorite ? 'Remove favorite' : 'Add to favorites'}
            </button>
          </div>
          {/* 同じ details 要素を保ち、記録や生成中 props の更新で開閉状態を作り直さない。 */}
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-700">
              Details
            </summary>
            {record ? (
              <div className="mt-5 min-w-0 space-y-5">
                <ColorCode
                  label="RGB"
                  value={formatRgb(hexToRgb(record.hex))}
                  disabled={!state.canCopy}
                  onCopy={(text) => props.onCopy('rgb', text)}
                />
                <ColorCode
                  label="HSL"
                  value={formatHsl(record.hsl)}
                  disabled={!state.canCopy}
                  onCopy={(text) => props.onCopy('hsl', text)}
                />
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-slate-600">SHA-256</p>
                  <code className="block text-sm leading-6 wrap-anywhere">{record.hash}</code>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Details will appear with a color.</p>
            )}
          </details>
        </div>
      </div>
    </section>
  );
}
