/**
 * Position size: (equity × engine_weight × risk_pct) / (pip value × SL distance in pips).
 * Min 1 unit, max 2% risk; graduated reduction 50% after 3 losses; conviction scaling ±15%.
 * pip value is converted to USD using live conversion rates cached by heartbeat.
 */

import { logInfo } from '../utils/logger.js';

const MIN_UNITS = 1;

const FALLBACK_RATES: Record<string, number> = {
  JPY: 150, CAD: 1.40, CHF: 0.88, GBP: 1.27, AUD: 0.63, NZD: 0.58,
};

function getPipValueUSD(instrument: string, conversionRate: number): number {
  const quote = instrument.length >= 7 ? instrument.slice(4, 7) : 'USD';
  const pipSize = instrument.includes('JPY') ? 0.01 : 0.0001;
  if (quote === 'USD') return pipSize;
  const rate = conversionRate > 0 ? conversionRate : (FALLBACK_RATES[quote] ?? 1);
  if (quote === 'JPY' || quote === 'CAD' || quote === 'CHF') return pipSize / rate;
  return pipSize * rate;
}

function getPipDistance(entry: number, stopLoss: number, instrument: string): number {
  const dist = Math.abs(entry - stopLoss);
  if (instrument.includes('JPY')) return dist * 100;
  return dist * 10000;
}

export interface PositionSizerParams {
  equity: number;
  engineWeight: number;
  riskPct: number;
  entry: number;
  stopLoss: number;
  instrument: string;
  consecutiveLosses: number;
  graduatedThreshold: number;
  confluenceScore: number;
  conversionRate?: number;
  slPipsOverride?: number;
}

export function calculateUnits(params: PositionSizerParams): number {
  const {
    equity,
    engineWeight,
    riskPct,
    entry,
    stopLoss,
    instrument,
    consecutiveLosses,
    graduatedThreshold,
    confluenceScore,
  } = params;

  let effectiveRisk = riskPct;
  if (consecutiveLosses >= graduatedThreshold) effectiveRisk *= 0.5;
  if (confluenceScore >= 85) effectiveRisk *= 1.15;
  else if (confluenceScore < 75) effectiveRisk *= 0.85;
  effectiveRisk = Math.min(effectiveRisk, 0.02);

  const riskAmount = equity * engineWeight * effectiveRisk;
  const pipDist = params.slPipsOverride != null ? params.slPipsOverride : getPipDistance(entry, stopLoss, instrument);
  if (pipDist <= 0) return MIN_UNITS;

  const pipValuePerUnit = getPipValueUSD(instrument, params.conversionRate ?? 0);
  const units = riskAmount / (pipDist * pipValuePerUnit);
  const rounded = Math.floor(Math.max(MIN_UNITS, units));
  logInfo('Position size', {
    equity,
    engineWeight,
    riskPct: effectiveRisk,
    riskAmountTarget: riskAmount,
    slPips: pipDist,
    pipValuePerUnit,
    riskPerUnit: pipDist * pipValuePerUnit,
    units: rounded,
  });
  return rounded;
}
