/**
 * AUDUSD Fade — pure strategy math ported from validated SIGNALFORGE engine-omega.
 *
 * Reference: trailing SMA(50) of AUD_USD M5 closes (no look-ahead).
 * Trigger:   |close - SMA50| >= THRESH (30p). Up-extension -> fade short; down -> fade long.
 * Bracket:   target toward mean (T10), stop on further extension (S15).
 * EUR gate:  aligned momentum over GATE_WIN (48) M5 bars; keep only if aligned >= CUTOFF (-50).
 *
 * Uses only the last CLOSED bar — caller passes completed candles only.
 */

import type { FadeConfig, FadeDirection } from './fadeTypes.js';
import { pipsToPrice, priceToPips } from './fadeTypes.js';

export interface FadeSetup {
  fade: FadeDirection;
  entry: number;
  sl: number;
  tp: number;
  extPips: number;
  aligned: number;
}

/** Trailing SMA over the last `period` closes (inclusive of the last closed bar). */
export function trailingSma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const window = closes.slice(closes.length - period);
  const sum = window.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

/** Signed extension of the last close from the SMA, in pips (+ = above mean). */
export function extensionAt(closes: number[], period: number): number | null {
  const sma = trailingSma(closes, period);
  if (sma == null) return null;
  const lastClose = closes[closes.length - 1];
  return priceToPips(lastClose - sma);
}

/** EURUSD aligned momentum over `windowBars` M5 bars, in signed pips. */
export function alignedMomentum(
  eurCloses: number[],
  windowBars: number,
  fade: FadeDirection,
): number | null {
  if (eurCloses.length < windowBars + 1) return null;
  const now = eurCloses[eurCloses.length - 1];
  const past = eurCloses[eurCloses.length - 1 - windowBars];
  const ret = priceToPips(now - past);
  return fade === 'long' ? ret : -ret;
}

function bracketFor(
  fade: FadeDirection,
  entry: number,
  cfg: FadeConfig,
): { sl: number; tp: number } {
  const dir = fade === 'long' ? 1 : -1;
  return {
    tp: entry + dir * pipsToPrice(cfg.targetPips),
    sl: entry - dir * pipsToPrice(cfg.stopPips),
  };
}

/**
 * Evaluate a fade setup from completed AUD/EUR M5 closes. Returns null when no
 * extension fires or the EURUSD gate rejects the candidate.
 */
export function evaluateSetup(
  audCloses: number[],
  eurCloses: number[],
  cfg: FadeConfig,
): FadeSetup | null {
  const extPips = extensionAt(audCloses, cfg.smaPeriod);
  if (extPips == null) return null;

  let fade: FadeDirection | null = null;
  if (extPips >= cfg.threshPips) fade = 'short';
  else if (extPips <= -cfg.threshPips) fade = 'long';
  if (!fade) return null;

  const aligned = alignedMomentum(eurCloses, cfg.gateWindowBars, fade);
  if (aligned == null) return null;
  if (aligned < cfg.gateCutoffPips) return null;

  const entry = audCloses[audCloses.length - 1];
  const { sl, tp } = bracketFor(fade, entry, cfg);
  return { fade, entry, sl, tp, extPips, aligned };
}
