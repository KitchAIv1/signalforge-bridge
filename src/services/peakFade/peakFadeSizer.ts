/**
 * Equity-proportional size: equity × weight × riskPct / riskRefPips.
 * riskRefPips is sizing-only (not a broker SL).
 */

import { PEAK_FADE_PIP_SIZE } from './peakFadeConstants.js';

export function sizePeakFadeUnits(params: {
  equity: number;
  engineWeight: number;
  riskPct: number;
  riskRefPips: number;
  capitalAllocationPct?: number;
}): number {
  const alloc =
    params.capitalAllocationPct != null && params.capitalAllocationPct > 0
      ? params.capitalAllocationPct
      : 1;
  const riskAmount = params.equity * alloc * params.engineWeight * (params.riskPct / 100);
  if (params.riskRefPips <= 0 || riskAmount <= 0) return 0;
  const raw = riskAmount / (params.riskRefPips * PEAK_FADE_PIP_SIZE);
  // Round to nearest 1000 units (0.01 lot) for OANDA/MT5 friendliness.
  return Math.max(1000, Math.round(raw / 1000) * 1000);
}
