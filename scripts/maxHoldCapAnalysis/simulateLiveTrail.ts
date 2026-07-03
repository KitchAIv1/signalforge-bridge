import {
  OMEGA_DEFAULT_MAX_HOLD_MINUTES,
  OMEGA_EXEC_COST_PIPS,
} from '../../src/services/omegaReplay/liveTrailConstants.js';
import { simulateOmegaTrailExit } from '../../src/services/omegaReplay/trailExitEngine.js';
import type { TimestampedBar } from '../../src/services/omegaReplay/types.js';
import {
  CAP_150_BARS,
  CAP_360_BARS,
  type M5Bar,
  type SimOutcome,
  type TradeDirection,
} from './types.js';

function toTimestampedBars(bars: readonly M5Bar[], entryTimeMs: number): TimestampedBar[] {
  const barMs = 5 * 60 * 1000;
  return bars.map((bar, index) => ({
    timeMs: bar.time ? Date.parse(bar.time) : entryTimeMs + (index + 1) * barMs,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}

function mapExitReason(
  reason: ReturnType<typeof simulateOmegaTrailExit>['exitReason'],
): SimOutcome['exitReason'] {
  if (reason === 'max_hold') return 'max_hold_cap';
  if (reason === 'insufficient_bars') return 'still_open';
  return reason;
}

function runCapSim(
  direction: TradeDirection,
  fillPrice: number,
  stopLoss: number,
  bars: readonly M5Bar[],
  entryTimeMs: number,
  capBars: number | null,
): SimOutcome | null {
  const timestamped = toTimestampedBars(bars, entryTimeMs);
  if (timestamped.length === 0) return null;

  const maxHoldMinutes =
    capBars != null ? capBars * 5 : OMEGA_DEFAULT_MAX_HOLD_MINUTES;

  const result = simulateOmegaTrailExit({
    direction,
    entryPrice: fillPrice,
    structureStop: stopLoss,
    entryTimeMs,
    bars: timestamped,
    maxHoldMinutes,
    executionCostPips: OMEGA_EXEC_COST_PIPS,
  });

  const rSizeRaw = Math.abs(fillPrice - stopLoss);
  return {
    exitReason: mapExitReason(result.exitReason),
    exitBar: result.exitBarIndex,
    grossPips: result.grossPips,
    netPips: result.netPips,
    netR: rSizeRaw > 0 ? result.grossPips * 0.0001 / rSizeRaw : 0,
  };
}

export function simulateLiveOmegaTrail(
  direction: TradeDirection,
  fillPrice: number,
  stopLoss: number,
  bars: readonly M5Bar[],
  maxCapBars: number | null,
  entryTimeMs: number = Date.now(),
): SimOutcome | null {
  return runCapSim(direction, fillPrice, stopLoss, bars, entryTimeMs, maxCapBars);
}

export function runThreeCaps(
  direction: TradeDirection,
  fillPrice: number,
  stopLoss: number,
  bars: readonly M5Bar[],
  entryTimeMs: number,
): { cap150: SimOutcome | null; cap360: SimOutcome | null; noCap72: SimOutcome | null } {
  return {
    cap150: runCapSim(direction, fillPrice, stopLoss, bars, entryTimeMs, CAP_150_BARS),
    cap360: runCapSim(direction, fillPrice, stopLoss, bars, entryTimeMs, CAP_360_BARS),
    noCap72: runCapSim(
      direction,
      fillPrice,
      stopLoss,
      bars.slice(0, CAP_360_BARS),
      entryTimeMs,
      null,
    ),
  };
}
