import type { AsianM5StoredCandle } from '../asianM5/asianM5Constants.js';
import {
  classifyAsianShapeFromInputs,
  computeTurnPositionFraction,
  type AsianShapeLabel,
} from './asianShapeTaxonomy.js';
import { computeAsianTurningPointMetrics } from './asianTurningPointMetrics.js';

export interface AsianShapeResult {
  turnTime: string;
  turnPosition: number;
  preTurnSpeed: number;
  postTurnSpeed: number;
  retracementPct: number;
  shape: AsianShapeLabel;
  unclassifiedReason: string | null;
}

export function classifyAsianShape(
  tradeDate: string,
  m5Candles: readonly AsianM5StoredCandle[],
): AsianShapeResult | null {
  const metrics = computeAsianTurningPointMetrics(tradeDate, m5Candles);
  if (!metrics) return null;

  const classification = classifyAsianShapeFromInputs({
    tradeDate,
    turnTime: metrics.turnTime,
    preTurnSpeed: metrics.preTurnSpeed,
    postTurnSpeed: metrics.postTurnSpeed,
    postTurnPips: metrics.postTurnPips,
    postTurnMinutes: metrics.postTurnMinutes,
    retracementPct: metrics.retracementPct,
  });

  return {
    turnTime: metrics.turnTime,
    turnPosition: Math.round(computeTurnPositionFraction(metrics.turnTime, tradeDate) * 1000) / 1000,
    preTurnSpeed: metrics.preTurnSpeed,
    postTurnSpeed: metrics.postTurnSpeed,
    retracementPct: metrics.retracementPct,
    shape: classification.shape,
    unclassifiedReason: classification.unclassifiedReason,
  };
}
