import { digestToHash, digestToHsl, hslToRgb, rgbToHex } from './color';
import type { ColorRecord } from './types';

type GenerationRequest = {
  timestamp: number;
  sequence: number;
  previousHex?: string;
};

type GenerationDependencies = {
  digest?: (seed: string) => Promise<ArrayBuffer>;
  createId?: () => string;
};

function sha256(seed: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
}

export async function generateColor(
  { timestamp, sequence, previousHex }: GenerationRequest,
  { digest = sha256, createId = () => crypto.randomUUID() }: GenerationDependencies = {},
): Promise<ColorRecord> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // 1 要求内の日時と連番は固定し、候補の再試行だけをシードへ反映する。
    const candidate = await digest(`rccg:v1:${timestamp}:${sequence}:${attempt}`);
    const hsl = digestToHsl(candidate);
    const hex = rgbToHex(hslToRgb(hsl));

    if (hex === previousHex) {
      continue;
    }

    // 不採用候補には ID を割り当てず、成功した記録だけを呼び出し側へ返す。
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

  throw new Error('Could not generate a different color after 8 attempts.');
}
