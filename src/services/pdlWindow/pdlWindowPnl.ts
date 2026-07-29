import {
  PDL_WINDOW_HARD_SL_PIPS,
  PDL_WINDOW_VT_SPREAD_PIPS,
} from './pdlWindowConstants.js';
import type { PdlWindowDirection, PdlWindowTradeResult } from './pdlWindowTypes.js';

export function hardSlPrice(
  entryPrice: number,
  direction: PdlWindowDirection,
): number {
  const offset = PDL_WINDOW_HARD_SL_PIPS * 0.0001;
  const raw = direction === 'long' ? entryPrice - offset : entryPrice + offset;
  return Math.round(raw * 100000) / 100000;
}

/** Gross trader pips before VT spread (positive = profit). */
export function signedTraderPips(
  direction: PdlWindowDirection,
  entryPrice: number,
  exitPrice: number,
): number {
  const raw =
    direction === 'long'
      ? (exitPrice - entryPrice) * 10000
      : (entryPrice - exitPrice) * 10000;
  return Math.round(raw * 10) / 10;
}

export function netPipsAfterSpread(grossTraderPips: number): number {
  return Math.round((grossTraderPips - PDL_WINDOW_VT_SPREAD_PIPS) * 10) / 10;
}

export function computePnlDollars(unitsAbs: number, netPips: number): number {
  return Math.round(unitsAbs * 0.0001 * netPips * 100) / 100;
}

export function computePnlR(netPips: number): number {
  return Math.round((netPips / PDL_WINDOW_HARD_SL_PIPS) * 1000) / 1000;
}

export function inferSlHit(
  direction: PdlWindowDirection,
  exitPrice: number,
  slPrice: number,
): boolean {
  const eps = 0.00005;
  if (direction === 'long') return exitPrice <= slPrice + eps;
  return exitPrice >= slPrice - eps;
}

export function resultFromClose(
  closeReason: string,
  netPips: number,
): PdlWindowTradeResult {
  if (closeReason === 'time_exit_1300') return 'time_exit';
  if (closeReason === 'sl_hit') return 'loss';
  if (netPips > 0) return 'win';
  if (netPips < 0) return 'loss';
  return 'breakeven';
}
