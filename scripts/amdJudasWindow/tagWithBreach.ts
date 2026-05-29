import type { AmdTag } from '../../src/services/amdDetector/amdTypes.js';
import type { JudasDetection } from './judasDetect.js';
import type { AsianBreachResult } from './asianBreach.js';

function resolveAmdTag(
  asianRangePips: number | null,
  reversalConfirmed: boolean | null,
  judasPips: number | null,
  compressionBreakout: boolean,
  delayedDistribution: boolean,
  asianIsFlat: boolean
): AmdTag {
  if (asianRangePips == null) return 'INSUFFICIENT_DATA';
  if (asianRangePips < 35) {
    if (asianIsFlat) {
      if (reversalConfirmed === true && (judasPips ?? 0) >= 8) return 'AMD_TEXTBOOK';
      if (compressionBreakout && !reversalConfirmed) return 'AMD_COMPRESSION_BREAKOUT';
      return 'AMD_FAILED';
    }
    return 'AMD_SHIFTED';
  }
  if (asianRangePips < 50) return 'AMD_SHIFTED';
  return 'AMD_NONE';
}

export function classifyTagWithBreachGate(
  detection: JudasDetection,
  breach: AsianBreachResult
): AmdTag {
  const hasJudas =
    detection.judasDirection === 'UP' || detection.judasDirection === 'DOWN';
  if (!hasJudas || breach.judasInsideAsianBox) return 'AMD_SHIFTED';
  return resolveAmdTag(
    detection.asianRangePips,
    detection.reversalConfirmed,
    detection.judasPips,
    detection.compressionBreakout,
    detection.delayedDistribution,
    detection.asianIsFlat
  );
}
