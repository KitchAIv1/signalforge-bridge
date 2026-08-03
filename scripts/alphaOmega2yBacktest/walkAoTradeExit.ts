/** Extracted from omegaHardStopExit — bar-walked AO exit (max-hold / opp / HS / backstop). */

import {
  AO2Y_MAX_HOLD_HOURS,
  AO2Y_MIN_FIRES_FOR_SHARE_CHECK,
  AO2Y_OPPOSING_COUNT_THRESHOLD,
  AO2Y_OPPOSING_SHARE_THRESHOLD,
  AO2Y_PIP_SIZE,
} from './ao2yContract.js';
import type { AoCandle, AoPricedFire } from './aoTypes.js';

export function firstCandleAtOrAfter(candles: readonly AoCandle[], iso: string): number {
  let lo = 0;
  let hi = candles.length;
  const targetMs = Date.parse(iso);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(candles[mid]!.time) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function maxHoldExit(
  candles: readonly AoCandle[],
  entryFire: AoPricedFire,
  deadlineMs: number,
): { exitTime: string; exitPrice: number } {
  const idx = firstCandleAtOrAfter(candles, new Date(deadlineMs).toISOString());
  const noCoverageBeyondDeadline = idx >= candles.length;
  const coveringIdx =
    !noCoverageBeyondDeadline && Date.parse(candles[idx]!.time) === deadlineMs ? idx : idx - 1;
  const bar = coveringIdx >= 0 ? candles[coveringIdx] : undefined;
  const barIsWithinOneDayOfDeadline =
    bar != null && Math.abs(Date.parse(bar.time) - deadlineMs) <= 24 * 60 * 60 * 1000;
  if (!bar || !barIsWithinOneDayOfDeadline) {
    return { exitTime: new Date(deadlineMs).toISOString(), exitPrice: entryFire.entryPrice };
  }
  return { exitTime: bar.time, exitPrice: bar.c };
}

export function walkAoTradeExit(
  fires: readonly AoPricedFire[],
  candles: readonly AoCandle[],
  entryIdx: number,
  backstopIdx: number,
  backstopTrigger: string,
  slPips: number,
): { exitTime: string; exitPrice: number; trigger: string } {
  const entryFire = fires[entryIdx]!;
  const direction = entryFire.direction;
  const backstopFire = fires[backstopIdx]!;
  const deadlineMs = Date.parse(backstopFire.firedAt);
  const maxHoldDeadlineMs = Date.parse(entryFire.firedAt) + AO2Y_MAX_HOLD_HOURS * 60 * 60 * 1000;

  let opposingCount = 0;
  let totalCount = 0;
  let fireCursor = entryIdx + 1;
  let candleCursor = firstCandleAtOrAfter(candles, entryFire.firedAt);

  while (true) {
    const nextFireTime = fireCursor <= backstopIdx ? Date.parse(fires[fireCursor]!.firedAt) : Infinity;
    const nextCandleTime =
      candleCursor < candles.length ? Date.parse(candles[candleCursor]!.time) : Infinity;
    if (nextFireTime === Infinity && nextCandleTime === Infinity) break;

    if (nextCandleTime > maxHoldDeadlineMs && nextFireTime > maxHoldDeadlineMs) {
      const { exitTime, exitPrice } = maxHoldExit(candles, entryFire, maxHoldDeadlineMs);
      return { exitTime, exitPrice, trigger: 'max_hold' };
    }
    if (nextCandleTime > deadlineMs && nextFireTime > deadlineMs) break;

    if (nextCandleTime <= nextFireTime) {
      const bar = candles[candleCursor]!;
      const adverse =
        direction === 'long'
          ? (entryFire.entryPrice - bar.l) / AO2Y_PIP_SIZE
          : (bar.h - entryFire.entryPrice) / AO2Y_PIP_SIZE;
      if (adverse >= slPips) {
        const exitPrice =
          direction === 'long'
            ? entryFire.entryPrice - slPips * AO2Y_PIP_SIZE
            : entryFire.entryPrice + slPips * AO2Y_PIP_SIZE;
        return { exitTime: bar.time, exitPrice, trigger: 'hard_stop' };
      }
      candleCursor += 1;
    } else {
      const fire = fires[fireCursor]!;
      totalCount += 1;
      if (fire.direction !== direction) opposingCount += 1;
      if (opposingCount >= AO2Y_OPPOSING_COUNT_THRESHOLD) {
        return { exitTime: fire.firedAt, exitPrice: fire.entryPrice, trigger: 'opposing_count' };
      }
      if (totalCount >= AO2Y_MIN_FIRES_FOR_SHARE_CHECK) {
        const share = opposingCount / totalCount;
        if (share >= AO2Y_OPPOSING_SHARE_THRESHOLD) {
          return { exitTime: fire.firedAt, exitPrice: fire.entryPrice, trigger: 'opposing_share' };
        }
      }
      fireCursor += 1;
    }
  }
  return {
    exitTime: backstopFire.firedAt,
    exitPrice: backstopFire.entryPrice,
    trigger: backstopTrigger,
  };
}
