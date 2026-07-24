/** Types for SPEEDFLOOR would-enter paper PnL (display-only; never written to trade log). */

export type PaperExitTrigger =
  | 'opposing_count'
  | 'opposing_share'
  | 'hard_stop'
  | 'giveback_trail'
  | 'backstop_crack'
  | 'max_hold'
  | 'open';

export type PaperOutcomeStatus = 'paper_closed' | 'paper_open' | 'insufficient_data';

export interface PaperCandle {
  time: string;
  h: number;
  l: number;
  c: number;
}

export interface PaperFire {
  firedAt: string;
  direction: 'LONG' | 'SHORT';
  markPrice: number | null;
  signalId: string;
}

export interface SpeedfloorPaperInput {
  tradeId: string;
  signalId: string;
  direction: 'LONG' | 'SHORT';
  entryAt: string;
  entryPrice: number;
  stopLoss: number | null;
  equity: number | null;
}

export interface SpeedfloorPaperOutcome {
  tradeId: string;
  signalId: string;
  status: PaperOutcomeStatus;
  paperPips: number | null;
  paperDollars: number | null;
  paperUnits: number | null;
  exitTrigger: PaperExitTrigger | null;
  exitAt: string | null;
  holdMinutes: number | null;
  entryPrice: number;
  detail: string | null;
}

export interface SpeedfloorPaperApiResponse {
  outcomes: Record<string, SpeedfloorPaperOutcome>;
  givebackEnabled: boolean;
}
