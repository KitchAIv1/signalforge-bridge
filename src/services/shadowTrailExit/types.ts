/** Shadow Trail v1 — shared types. */

export const SHADOW_TRAIL_SL_R = 1.5;
export const SHADOW_TRAIL_DIST_R = 0.5;
export const SHADOW_TRAIL_ACTIVATION_R = 0;
export const SHADOW_EXECUTION_COST_PIPS = 1.2;
export const PIP_SIZE = 0.0001;
export const MAX_FORWARD_BARS = 576;

export type SessionWindow = 'asian' | 'dist_loose' | 'outside';
export type SequencedStatus = 'executed' | 'blocked' | 'skipped';

export interface M5Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PendingOmegaSignal {
  signalId: string;
  tradeLogId: string;
  firedAt: string;
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  rSizeRaw: number;
  rPips: number;
  livePnlPips: number | null;
  liveResult: string | null;
}

export interface TrailSimOutcome {
  exitType: 'trail_sl' | 'trail_profit' | 'open';
  grossPips: number;
  netPips: number;
  exitBars: number;
  win: boolean;
}

export interface ShadowTrailRow {
  signal_id: string;
  trade_log_id: string;
  fired_at: string;
  trade_date: string;
  direction: string;
  entry_price: number;
  r_pips: number;
  r_size_raw: number;
  session_window: SessionWindow;
  filter_passed: boolean;
  filter_reason: string | null;
  expected_direction: string | null;
  shadow_exit_type: string | null;
  shadow_pips_gross: number | null;
  shadow_pips_net: number | null;
  shadow_exit_bars: number | null;
  shadow_win: boolean | null;
  shadow_opt_sl_r: number | null;
  shadow_opt_exit_type: string | null;
  shadow_opt_pips_gross: number | null;
  shadow_opt_pips_net: number | null;
  shadow_opt_exit_bars: number | null;
  shadow_opt_win: boolean | null;
  execution_cost_pips: number;
  sequenced_status: SequencedStatus;
  sequenced_pips_net: number | null;
  sequenced_opt_status: SequencedStatus | null;
  sequenced_opt_pips_net: number | null;
  live_pnl_pips: number | null;
  live_result: string | null;
  resolved_at: string;
}

export interface WindowFilterResult {
  sessionWindow: SessionWindow;
  filterPassed: boolean;
  filterReason: string | null;
  expectedDirection: 'long' | 'short' | null;
}
