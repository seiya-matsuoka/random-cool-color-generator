/** 通知の内容と読み上げを指定する。時間による消去や操作結果の判断は呼び出し側が担当する。 */
export type NoticeProps = {
  tone: 'success' | 'error' | 'warning';
  message: string;
  /** 同じ内容を別の通知でも読み上げないよう、読み上げ担当を明示できる。 */
  live?: 'polite' | 'assertive' | 'off';
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
};

/** 色だけで区別せず、種別のテキストと内容を表示する。例外・スタックトレースは受け取らない。 */
export function Notice({
  tone,
  message,
  live = tone === 'error' ? 'assertive' : 'polite',
  actionLabel,
  actionDisabled = false,
  onAction,
}: NoticeProps) {
  const label = { success: 'Success', error: 'Error', warning: 'Storage notice' }[tone];
  const appearance = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    error: 'border-red-200 bg-red-50 text-red-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
  }[tone];

  return (
    <div
      role={live === 'off' ? undefined : live === 'assertive' ? 'alert' : 'status'}
      aria-atomic="true"
      className={`rounded-xl border p-4 ${appearance}`}
    >
      <p className="text-sm leading-6 wrap-anywhere">
        <strong>{label}: </strong>
        {message}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          disabled={actionDisabled}
          onClick={onAction}
          className="mt-3 min-h-11 rounded-lg border border-current px-4 py-2 text-sm font-semibold hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
