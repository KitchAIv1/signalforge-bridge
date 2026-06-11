/** Prior-day AMD tag directional implication for Asian session (tradeable prior, not same-day). */

export interface PriorAmdContext {
  readonly bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  readonly pct: number;
  readonly confidence: 'LOW' | 'MEDIUM' | 'NEUTRAL';
  readonly label: string;
  readonly sampleSize: number;
}

export function getPriorAmdContext(priorAmdTag: string | null): PriorAmdContext {
  switch (priorAmdTag) {
    case 'AMD_FAILED':
      return {
        bias: 'SHORT',
        pct: 61.5,
        confidence: 'LOW',
        label: 'AMD_FAILED prior (61.5% SHORT)',
        sampleSize: 13,
      };
    case 'AMD_SHIFTED':
      return {
        bias: 'NEUTRAL',
        pct: 50,
        confidence: 'NEUTRAL',
        label: 'AMD_SHIFTED prior (coin flip)',
        sampleSize: 16,
      };
    case 'AMD_COMPRESSION_BREAKOUT':
      return {
        bias: 'NEUTRAL',
        pct: 50,
        confidence: 'NEUTRAL',
        label: 'AMD_COMPRESSION prior (coin flip)',
        sampleSize: 8,
      };
    case 'AMD_NONE':
      return {
        bias: 'NEUTRAL',
        pct: 50,
        confidence: 'NEUTRAL',
        label: 'AMD_NONE prior (coin flip)',
        sampleSize: 2,
      };
    case 'AMD_TEXTBOOK':
      return {
        bias: 'SHORT',
        pct: 57.9,
        confidence: 'MEDIUM',
        label: 'AMD_TEXTBOOK prior (57.9% SHORT)',
        sampleSize: 38,
      };
    default:
      return {
        bias: 'NEUTRAL',
        pct: 50,
        confidence: 'NEUTRAL',
        label: 'No prior data',
        sampleSize: 0,
      };
  }
}

export function getPriorAmdSizeMultiplier(
  priorAmdShifted: boolean,
  sizeMultiplier: number | null,
): string {
  if (sizeMultiplier != null) {
    return `${sizeMultiplier === 1.0 ? '1.0' : '0.75'}×`;
  }
  return priorAmdShifted ? '1.0×' : '0.75×';
}
