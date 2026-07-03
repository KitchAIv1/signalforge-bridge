/** Active one-trade slot during sequenced replay. */

import type { ReplayExitReason, TradeDirection } from './types.js';

export interface ActiveReplaySlot {
  signalId: string;
  direction: TradeDirection;
  firedAtMs: number;
  openUntilMs: number;
  exitReason: ReplayExitReason;
  holdMinutes: number;
  netPips: number;
}

export function directionRelation(
  signalDirection: TradeDirection,
  blockerDirection: TradeDirection,
): 'same' | 'opposite' {
  return signalDirection === blockerDirection ? 'same' : 'opposite';
}

export function slotFromExecutedRow(
  signalId: string,
  direction: TradeDirection,
  firedAtMs: number,
  holdMinutes: number,
  exitReason: ReplayExitReason,
  netPips: number,
): ActiveReplaySlot {
  return {
    signalId,
    direction,
    firedAtMs,
    openUntilMs: firedAtMs + holdMinutes * 60_000,
    exitReason,
    holdMinutes,
    netPips,
  };
}
