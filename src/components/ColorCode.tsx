/** 表示値をそのままコピー要求へ渡す UI。clipboard の成功・失敗は呼び出し側が扱う。 */
type ColorCodeProps = {
  label: 'HEX' | 'RGB' | 'HSL';
  value: string;
  disabled?: boolean;
  onCopy: (value: string) => void;
};

/** 値は選択可能なテキストとして残し、コピー API に失敗しても手動コピーできるようにする。 */
export function ColorCode({ label, value, disabled = false, onCopy }: ColorCodeProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <code className="min-w-0 text-lg font-semibold wrap-anywhere">{value}</code>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCopy(value)}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Copy {label}
      </button>
    </div>
  );
}
