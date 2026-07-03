export const PIP_SIZE = 0.0001;
export const EXEC_COST_PIPS = 1.2;
export const CAP_150_BARS = 30;
export const CAP_360_BARS = 72;
export const TRAIL_DIST_R = 0.5;
export const ACTIVATION_R = 0;

export type TradeDirection = 'long' | 'short';

export interface M5Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LiveTradeRow {
  id: string;
  signal_id: string | null;
  oanda_trade_id: string | null;
  direction: string;
  fill_price: number;
  stop_loss: number;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_dollars: number | null;
  pnl_r: number | null;
  close_reason: string | null;
  duration_minutes: number | null;
  signal_received_at: string;
  closed_at: string | null;
  pair: string;
}

export type SimExitReason =
  | 'trail_stop'
  | 'trail_sl_hit'
  | 'max_hold_cap'
  | 'still_open';

export interface SimOutcome {
  exitReason: SimExitReason;
  exitBar: number;
  grossPips: number;
  netPips: number;
  netR: number;
}

export interface TradeComparison {
  tradeId: string;
  ticket: string | null;
  direction: TradeDirection;
  liveCloseReason: string | null;
  livePips: number | null;
  liveDurMin: number | null;
  sim150: SimOutcome | null;
  sim360: SimOutcome | null;
  simNoCap72: SimOutcome | null;
  delta150VsLive: number | null;
  delta360VsLive: number | null;
  barsAvailable: number;
}
