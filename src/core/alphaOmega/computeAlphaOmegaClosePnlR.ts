import { HARD_STOP_PIPS } from './alphaOmegaConstants.js';

export interface AlphaOmegaClosePnlRInput {
  exitPrice: number | null;
  fillPrice: number | null;
  direction: string | null;
  rSizeRaw: number | null;
  pnlPips: number | null;
  pnlDollars: number | null;
  stopLoss: number | null;
  units: number | null;
}

/** Prefer dollar/risk, then price/rSize, then pips / hard-stop (1R = HARD_STOP_PIPS). */
export function computeAlphaOmegaClosePnlR(input: AlphaOmegaClosePnlRInput): number | null {
  const fromRisk = pnlRFromDollarRisk(input);
  if (fromRisk != null) return fromRisk;
  const fromRSize = pnlRFromRSizeRaw(input);
  if (fromRSize != null) return fromRSize;
  return pnlRFromHardStopPips(input.pnlPips);
}

function pnlRFromDollarRisk(input: AlphaOmegaClosePnlRInput): number | null {
  const { fillPrice, stopLoss, units, pnlDollars } = input;
  if (fillPrice == null || stopLoss == null || units == null || pnlDollars == null) return null;
  const absUnits = Math.abs(units);
  if (absUnits <= 0) return null;
  const slDistance = Math.abs(fillPrice - stopLoss);
  const riskAmount = slDistance * absUnits;
  if (riskAmount <= 0) return null;
  return Math.round((pnlDollars / riskAmount) * 100) / 100;
}

function pnlRFromRSizeRaw(input: AlphaOmegaClosePnlRInput): number | null {
  const { exitPrice, fillPrice, direction, rSizeRaw } = input;
  if (exitPrice == null || fillPrice == null || rSizeRaw == null || rSizeRaw <= 0) return null;
  const rawMove =
    String(direction ?? '').toLowerCase() === 'short'
      ? fillPrice - exitPrice
      : exitPrice - fillPrice;
  return Math.round((rawMove / rSizeRaw) * 100) / 100;
}

function pnlRFromHardStopPips(pnlPips: number | null): number | null {
  if (pnlPips == null || !Number.isFinite(pnlPips) || HARD_STOP_PIPS <= 0) return null;
  return Math.round((pnlPips / HARD_STOP_PIPS) * 100) / 100;
}
