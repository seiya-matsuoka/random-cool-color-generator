import { useEffect, useId, useRef } from 'react';
import type { RefObject } from 'react';

/** 見た目に必要な確認情報。削除を実行する関数や保存結果は保持しない。 */
export type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  targetHex?: string;
  focusTarget: 'history' | 'favorites';
};

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  targetHex?: string;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
};

/** open を受け取る制御されたダイアログ。親は要求を受けた後に open を更新する。 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  targetHex,
  fallbackFocusRef,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 開いた時点の復帰先を保持し、cleanup が後の render の ref を誤って参照しないようにする。
    const fallback = fallbackFocusRef?.current;

    // open 属性だけでは背景が操作可能なままになる。showModal によりブラウザのモーダル制御を使う。
    // Strict Mode の effect 再実行でも二重に開かないよう、DOM 側の現在値を確認する。
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus();

    return () => {
      dialog.close();
      // 一覧から起点が消えた場合や無効になった場合は、親から指定された見出しへ戻す。
      const target = origin?.isConnected && !origin.matches(':disabled') ? origin : fallback;
      target?.focus();
    };
  }, [open, fallbackFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Escape の既定の閉じ方を止め、Cancel ボタンと同じ親の状態更新を通す。
        // close イベントから再通知しないため、1 操作でコールバックを重複させない。
        event.preventDefault();
        onCancel();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {title}
      </h2>
      <p id={descriptionId} className="mt-3 text-sm leading-7 wrap-anywhere text-slate-600">
        {description}
      </p>
      {targetHex && (
        <p className="mt-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            style={{ backgroundColor: targetHex }}
            className="size-10 rounded-lg border border-black/10"
          />
          <code className="font-semibold">{targetHex}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
