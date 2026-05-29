import {
  analyzeFirst36Window,
  isPeakMoveCorrect,
  judasInversionDirection,
} from '../amdConflictedWeakD1/conflictedWeakD1Logic.js';
import type { M5Bar } from '../regimeVsAmd/regimeVsAmdM5Walk.js';

export type JudasPeakOutcome = {
  judasCorrect: boolean | null;
  peakFavorableJudasPips: number;
  peakFavorableCounterPips: number;
  netPipsDistribution: number;
};

export function scoreJudasPeakOutcome(
  m5Candles: M5Bar[],
  judasDirection: string | null
): JudasPeakOutcome | null {
  const judasPred = judasInversionDirection(judasDirection);
  const analysis = analyzeFirst36Window(m5Candles, judasPred, null);
  if (analysis == null) return null;
  const counterPred =
    judasPred === 'long' ? 'short' : judasPred === 'short' ? 'long' : null;
  const counterAnalysis =
    counterPred != null
      ? analyzeFirst36Window(m5Candles, counterPred, null)
      : null;
  return {
    judasCorrect: isPeakMoveCorrect(
      analysis.peakFavorableJudas,
      judasPred != null
    ),
    peakFavorableJudasPips: analysis.peakFavorableJudas,
    peakFavorableCounterPips: counterAnalysis?.peakFavorableJudas ?? 0,
    netPipsDistribution: analysis.netPips,
  };
}
