/** 保存された絶対時刻を、表示対象の日時のローカル時刻・UTC オフセットで表す。 */
export function formatGeneratedAt(timestamp: number): string {
  // 呼び出し側は検証済み記録か生成成功記録を渡す。日時文字列自体は保存しない。
  const date = new Date(timestamp);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  // getTimezoneOffset は UTC - ローカルの分数なので、表示用の符号は逆になる。
  // 対象 date から取得するため、過去の記録もその日時の夏時間で表示できる。
  const offset = -date.getTimezoneOffset();
  const minutes = Math.abs(offset);
  const timezone = `${offset >= 0 ? '+' : '-'}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)} UTC${timezone}`;
}
