import type { DetectionDirection, DetectionResult, M5Candle } from './types.js';
import { notDetectedResult, round1 } from './types.js';

const EARLY_BAR_END = 12;
const MIN_EXTREME_PIPS = 8;
const RETEST_BUFFER = 0.0002;
const MOMENTUM_START_MIN = 24;
const MOMENTUM_START_MAX = 48;
const MOMENTUM_WINDOW = 12;
const MIN_MOMENTUM_NET = 5;
const MAX_ADVERSE_PIPS = 5;

function maxAdverseInWindow(
  window: M5Candle[],
  recoveryDirection: DetectionDirection,
): number {
  let maxAdverse = 0;
  for (let bar = 1; bar < window.length; bar += 1) {
    const barMove = (window[bar].close - window[bar - 1].close) * 10000;
    const adverseMove = recoveryDirection === 'long' ? -barMove : barMove;
    if (adverseMove > maxAdverse) maxAdverse = adverseMove;
  }
  return maxAdverse;
}

function findMomentumBar(
  candles: M5Candle[],
  recoveryDirection: DetectionDirection,
): number | null {
  for (let start = MOMENTUM_START_MIN; start <= MOMENTUM_START_MAX; start += 1) {
    const window = candles.slice(start, start + MOMENTUM_WINDOW);
    if (window.length < MOMENTUM_WINDOW) break;

    const netMove = (window[11].close - window[0].open) * 10000;
    const isCorrect = recoveryDirection === 'long'
      ? netMove >= MIN_MOMENTUM_NET
      : netMove <= -MIN_MOMENTUM_NET;
    if (!isCorrect) continue;
    if (maxAdverseInWindow(window, recoveryDirection) < MAX_ADVERSE_PIPS) return start;
  }
  return null;
}

export function detectConditionBSlow(candles: M5Candle[]): DetectionResult {
  if (candles.length < 49) return notDetectedResult();

  const open = candles[0].close;
  let extremeBar = 0;
  let extremeType: 'low' | 'high' = 'low';
  let extremePrice = candles[0].close;
  let extremePipsFromOpen = 0;

  for (let bar = 0; bar <= EARLY_BAR_END; bar += 1) {
    const lowPips = (open - candles[bar].low) * 10000;
    const highPips = (candles[bar].high - open) * 10000;
    if (lowPips > extremePipsFromOpen) {
      extremePipsFromOpen = lowPips;
      extremePrice = candles[bar].low;
      extremeBar = bar;
      extremeType = 'low';
    }
    if (highPips > extremePipsFromOpen) {
      extremePipsFromOpen = highPips;
      extremePrice = candles[bar].high;
      extremeBar = bar;
      extremeType = 'high';
    }
  }

  if (extremePipsFromOpen < MIN_EXTREME_PIPS) return notDetectedResult();

  for (let bar = MOMENTUM_START_MIN; bar <= MOMENTUM_START_MAX; bar += 1) {
    if (extremeType === 'low' && candles[bar].low <= extremePrice + RETEST_BUFFER) {
      return notDetectedResult();
    }
    if (extremeType === 'high' && candles[bar].high >= extremePrice - RETEST_BUFFER) {
      return notDetectedResult();
    }
  }

  const recoveryDirection: DetectionDirection = extremeType === 'low' ? 'long' : 'short';
  const momentumBar = findMomentumBar(candles, recoveryDirection);
  if (momentumBar === null) return notDetectedResult();

  return {
    detected: true,
    detection_bar: momentumBar,
    direction: recoveryDirection,
    net_pips: round1((candles[momentumBar].close - open) * 10000),
  };
}
