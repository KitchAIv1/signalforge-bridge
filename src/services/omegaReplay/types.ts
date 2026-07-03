/** OMEGA sequenced replay — shared types. */

export type TradeDirection = 'long' | 'short';

export type ReplayGateStatus = 'executed' | 'blocked_gate' | 'blocked_sequence';

export type ReplayExitReason =
  | 'trail_stop'
  | 'trail_sl_hit'
  | 'max_hold'
  | 'insufficient_bars';

export interface TimestampedBar {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TrailExitResult {
  exitReason: ReplayExitReason;
  exitTimeMs: number;
  holdMinutes: number;
  grossPips: number;
  netPips: number;
  exitBarIndex: number;
}

export interface ReplaySignalInput {
  signalId: string;
  firedAtIso: string;
  direction: TradeDirection;
  signalEntry: number;
  signalStopLoss: number;
  bars: TimestampedBar[];
}

export interface LiveFillRecord {
  fillPrice: number;
  structureStop: number;
  livePnlPips: number | null;
  liveCloseReason: string | null;
  liveDurationMin: number | null;
}

export interface ReplayConfig {
  rawMode: boolean;
  maxHoldMinutes: number;
  executionCostPips: number;
  omegaDirectionByDate: Map<string, string>;
}

export interface ReplayTradeRow {
  signalId: string;
  firedAtIso: string;
  hourUtc: number;
  direction: TradeDirection;
  sessionWindow: 'asian' | 'dist_loose' | 'outside';
  gateStatus: ReplayGateStatus;
  gateReason: string | null;
  entryPrice: number;
  structureStop: number;
  rPips: number;
  exitReason: ReplayExitReason | null;
  holdMinutes: number | null;
  grossPips: number | null;
  netPips: number | null;
  exitBarIndex: number | null;
  livePnlPips: number | null;
  liveCloseReason: string | null;
  liveDurationMin: number | null;
  deltaSimVsLive: number | null;
  /** Set when gateStatus = blocked_sequence */
  blockerSignalId?: string | null;
  blockerDirection?: TradeDirection | null;
  blockerExitReason?: ReplayExitReason | null;
  blockerHoldMinutes?: number | null;
  blockerNetPips?: number | null;
  directionVsBlocker?: 'same' | 'opposite' | null;
  /** Sim PnL if this signal had executed (not sequenced) */
  shadowNetPipsIfExecuted?: number | null;
}

export interface ReplaySummary {
  sinceIso: string;
  rawMode: boolean;
  maxHoldMinutes: number;
  totalSignals: number;
  gateBlocked: number;
  sequenceBlocked: number;
  executed: number;
  insufficientBars: number;
  simTotalNetPips: number;
  simWinRate: number;
  liveMatched: number;
  liveTotalNetPips: number;
  liveWinRate: number;
  meanAbsDeltaPips: number;
}
