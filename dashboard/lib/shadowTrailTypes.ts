/** Dashboard types for omega shadow Trail v1 monitor. */

export interface ShadowTrailRow {
  signal_id: string;
  fired_at: string;
  trade_date: string;
  direction: string;
  session_window: string | null;
  filter_passed: boolean;
  filter_reason: string | null;
  shadow_pips_net: number | null;
  shadow_win: boolean | null;
  shadow_opt_sl_r: number | null;
  shadow_opt_pips_net: number | null;
  shadow_opt_win: boolean | null;
  sequenced_status: string | null;
  sequenced_pips_net: number | null;
  sequenced_opt_status: string | null;
  sequenced_opt_pips_net: number | null;
  live_pnl_pips: number | null;
  live_result: string | null;
}

export interface ShadowTrailSummary {
  rowCount: number;
  filteredCount: number;
  shadowUngatedTotal: number;
  shadowSequencedTotal: number;
  shadowOptUngatedTotal: number;
  shadowOptSequencedTotal: number;
  liveTotal: number;
  sequencedExecuted: number;
  sequencedBlocked: number;
  sequencedOptExecuted: number;
  sequencedOptBlocked: number;
}

export interface ShadowTrailPayload {
  rows: ShadowTrailRow[];
  summary: ShadowTrailSummary;
}
