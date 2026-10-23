import { digestToHash, digestToHsl, hslToRgb, rgbToHex } from './color';
import type { ColorRecord } from './types';

/**
 * 1 回の生成要求に対応する入力。日時の取得と連番の採番は呼び出し側で済ませる。
 * 数値の妥当性や previousHex の形式は、この関数へ渡す側の前提条件とする。
 */
type GenerationRequest = {
  /** シードと生成記録の両方に使う、Unix epoch からのミリ秒。 */
  timestamp: number;
  /** 1 から始まる生成要求の連番。この関数自身は採番や更新を行わない。 */
  sequence: number;
  /** 直前の表示色など、連続して同じ色になることを避けるための比較対象。省略時は比較しない。 */
  previousHex?: string;
};

/**
 * ブラウザ API に依存する処理だけを、必要に応じてテスト用の関数へ差し替えるための入口。
 * ? は省略可能なプロパティを表し、未指定なら generateColor の既定の関数を使用する。
 * Promise<ArrayBuffer> は、非同期にダイジェストが得られることを型で表す。
 */
type GenerationDependencies = {
  digest?: (seed: string) => Promise<ArrayBuffer>;
  createId?: () => string;
};

/** シードを UTF-8 のバイト列に変換し、標準の Web Crypto で SHA-256 を計算する。 */
function sha256(seed: string): Promise<ArrayBuffer> {
  // digest API は文字列を直接受け取らないため、TextEncoder でバイナリデータへ変換する。
  // API が失敗した場合は、その失敗を返す。別方式の乱数生成へは切り替えない。
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
}

/**
 * 直前の HEX と異なる候補を最大 8 回まで求め、採用した色の生成記録を返す。
 * 第 2 引数は省略でき、指定した依存関数だけを既定の Web Crypto の処理から置き換えられる。
 * async 関数のため戻り値は Promise となり、成功した記録は呼び出し側で await して受け取る。
 * 8 候補すべての衝突、ダイジェストの不正な長さ、API の失敗は Promise の拒否として通知する。
 * 履歴や画面状態は操作せず、呼び出し側が成功時だけ反映できるようにする。
 */
export async function generateColor(
  { timestamp, sequence, previousHex }: GenerationRequest,
  { digest = sha256, createId = () => crypto.randomUUID() }: GenerationDependencies = {},
): Promise<ColorRecord> {
  // attempt は 0 始まりであり、「最大 8 回」は初回を含む 0〜7 の候補を意味する。
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // バージョン付きのシード形式を固定し、同じ日時・連番・試行番号から同じ色を再現できるようにする。
    // 1 要求内では日時と連番を固定し、候補の再試行だけをシードへ反映する。
    // await は計算の完了を待つ。digest の失敗はここで伝播させ、衝突の再試行とは区別する。
    const candidate = await digest(`rccg:v1:${timestamp}:${sequence}:${attempt}`);
    const hsl = digestToHsl(candidate);
    const hex = rgbToHex(hslToRgb(hsl));

    // 比較対象は直前の HEX だけとし、過去の全履歴との重複や見た目の近さは判定しない。
    if (hex === previousHex) {
      continue;
    }

    // 不採用候補には ID を割り当てず、採用候補だけで UUID を作る。
    // UUID の生成も成功して初めて、元の HSL とハッシュを含む記録全体を返す。
    return {
      id: createId(),
      generatedAt: timestamp,
      sequence,
      attempt,
      hash: digestToHash(candidate),
      hsl,
      hex,
    };
  }

  // 衝突した最後の候補を返すと「直前と異なる色」の条件を破るため、記録を返さず失敗とする。
  throw new Error('Could not generate a different color after 8 attempts.');
}
