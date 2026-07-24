/**
 * Synthetic pure units for SPEEDFLOOR paper $ — mirrors live AO pure sizing
 * (0.25 × 3% → cap 3M → Asia post-cap ×0.40). Display-only.
 */

import {
  PAPER_ASIAN_WEIGHT,
  PAPER_ENGINE_WEIGHT,
  PAPER_MAX_ABS_UNITS,
  PAPER_PIP,
  PAPER_RISK_PCT,
} from './paperSimConstants';

export function signalSlPips(entry: number, stopLoss: number | null): number | null {
  if (stopLoss == null) return null;
  const pips = Math.abs(entry - stopLoss) / PAPER_PIP;
  return Math.round(pips * 10) / 10;
}

function isAsianUtc(asOf: Date): boolean {
  const hour = asOf.getUTCHours();
  return hour >= 21 || hour < 8;
}

export function sizeSpeedfloorPaperUnits(
  equity: number,
  entry: number,
  stopLoss: number | null,
  asOf: Date,
): number | null {
  const slPips = signalSlPips(entry, stopLoss);
  if (!(equity > 0) || slPips == null || slPips <= 0) return null;
  const riskAmount = equity * PAPER_ENGINE_WEIGHT * PAPER_RISK_PCT;
  let units = Math.floor(riskAmount / (slPips * PAPER_PIP));
  if (units > PAPER_MAX_ABS_UNITS) units = PAPER_MAX_ABS_UNITS;
  if (isAsianUtc(asOf)) {
    const scale = PAPER_ASIAN_WEIGHT / PAPER_ENGINE_WEIGHT;
    units = Math.max(1, Math.round(units * scale));
  }
  return units;
}

export function dollarsFromPaperPips(pips: number, units: number): number {
  return Math.round(pips * units * PAPER_PIP * 100) / 100;
}
