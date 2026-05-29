/**
 * Regime L4/L5/L6 + classifyRegime at 10:31 UTC for a historical trade_date.
 */

import { fetchCompletedCandles } from '../../src/connectors/oanda.js';
import {
  computeLayer4,
  computeLayer5,
  computeLayer6,
  computeLayer7,
  fetchCurrentMidPrice,
  isWeeklyOpenWindow,
  type Layer4Result,
  type Layer5Result,
} from '../../src/services/regimeDetector/layerComputation.js';
import { classifyRegime, type RegimeOutput } from '../../src/services/regimeDetector/regimeClassifier.js';

const AUD_PAIR = 'AUD_USD';
const D1_DAYS_BACK = 18;
const H4_DAYS_BACK = 3;

function historicalLookbackIso(evaluatedAt: Date, daysBack: number): string {
  const lookback = new Date(evaluatedAt);
  lookback.setUTCDate(lookback.getUTCDate() - daysBack);
  lookback.setUTCHours(0, 0, 0, 0);
  return lookback.toISOString();
}

function evaluatedAt1031(tradeDate: string): Date {
  return new Date(`${tradeDate}T10:31:00.000Z`);
}

export type RegimeAt1031 = {
  evaluatedAtIso: string;
  layer4: Layer4Result;
  layer5: Layer5Result;
  layer5Effective: Layer5Result;
  layer6PositionPct: number;
  regime: RegimeOutput;
};

export async function computeRegimeAt1031(tradeDate: string): Promise<RegimeAt1031 | null> {
  const evaluatedAt = evaluatedAt1031(tradeDate);
  const toIso = evaluatedAt.toISOString();
  const fromD1 = historicalLookbackIso(evaluatedAt, D1_DAYS_BACK);
  const fromH4 = historicalLookbackIso(evaluatedAt, H4_DAYS_BACK);

  const [d1Candles, h4Candles] = await Promise.all([
    fetchCompletedCandles(AUD_PAIR, 'D', fromD1, toIso),
    fetchCompletedCandles(AUD_PAIR, 'H4', fromH4, toIso),
  ]);

  if (d1Candles.length < 5 || h4Candles.length < 6) return null;

  const l4 = computeLayer4(d1Candles, evaluatedAt);
  const l5 = computeLayer5(h4Candles, evaluatedAt);
  const l6 = computeLayer6(d1Candles, evaluatedAt);

  let effectiveL5 = l5.result;
  if (isWeeklyOpenWindow(evaluatedAt)) {
    const mid = await fetchCurrentMidPrice(AUD_PAIR);
    if (mid != null) {
      const l7 = computeLayer7(d1Candles, mid, evaluatedAt);
      if (l7.l5Override != null) effectiveL5 = l7.l5Override;
    }
  }

  const regime = classifyRegime(l4.result, effectiveL5, l6.positionPct, Math.abs(l5.pipDiff));

  return {
    evaluatedAtIso: toIso,
    layer4: l4.result,
    layer5: l5.result,
    layer5Effective: effectiveL5,
    layer6PositionPct: l6.positionPct,
    regime,
  };
}

export function regimeToTradeDirection(
  direction: RegimeOutput['direction']
): 'long' | 'short' | 'pause' {
  if (direction === 'LONG') return 'long';
  if (direction === 'SHORT') return 'short';
  return 'pause';
}
