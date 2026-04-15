export type DecisionType = 'EXECUTED' | 'BLOCKED' | 'SKIPPED' | 'DEDUPLICATED';

export interface BridgeConfigRow {
  config_key: string;
  config_value: unknown;
}

export interface BridgeBrokerRow {
  broker_id: string;
  connection_status: string | null;
  last_heartbeat_at: string | null;
  display_name: string;
}

export interface BridgeEngineRow {
  engine_id: string;
  display_name: string;
  is_active: boolean;
  execution_threshold: number;
  max_daily_trades: number;
  trades_today: number;
  max_hold_hours: number;
}

export interface BridgeHealthLogRow {
  id: string;
  checked_at: string;
  oanda_ok: boolean;
  supabase_ok: boolean;
  broker_connection_status: string | null;
}

export interface BridgeTradeLogRow {
  id: string;
  signal_id: string;
  engine_id: string;
  pair: string;
  direction: string;
  decision: DecisionType;
  block_reason: string | null;
  decision_latency_ms: number | null;
  status: 'pending' | 'open' | 'closed';
  result: string | null;
  confluence_score: number | null;
  units: number | null;
  risk_amount: number | null;
  pnl_dollars: number | null;
  signal_received_at: string;
  created_at: string;

  fill_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  pnl_pips: number | null;
  pnl_r: number | null;
  lot_size: number | null;
  slippage_pips: number | null;
  close_reason: string | null;
  duration_minutes: number | null;
}

export interface OmegaShadowSignalRow {
  id: string;
  pattern_id: string;
  fired_at: string;
  pair: string;
  timeframe: string;
  direction: 'long' | 'short';
  entry_price: number;
  sl_price: number;
  tp_1r_price: number;
  tp_2r_price: number;
  tp_3r_price: number;
  r_size_raw: number;
  spread_pips: number;
  spread_r: number;
  session: string;
  regime: string;
  atr14_raw: number;
  centroid_distance: number;
  confidence: number;
  resolved_at: string | null;
  final_outcome: 'tp1r' | 'tp2r' | 'tp3r' | 'sl' | 'expired' | null;
  mfe_r: number | null;
  mae_r: number | null;
  mfe_pips: number | null;
  mae_pips: number | null;
  time_to_mfe_bars: number | null;
  sl_hit: boolean | null;
  tp_1r_hit: boolean | null;
  tp_2r_hit: boolean | null;
  tp_3r_hit: boolean | null;
  sl_hit_bar: number | null;
  during_news_event?: string | null;
  tp_1r_hit_bar: number | null;
  created_at: string;
}

export interface OmegaWeeklyReportRow {
  id: string;
  week_start: string;
  week_end: string;
  signals_fired: number;
  signals_resolved: number;
  r1_hit_rate: number | null;
  r2_hit_rate: number | null;
  sl_hit_rate: number | null;
  avg_mfe_r: number | null;
  avg_mae_r: number | null;
  avg_time_to_mfe_bars: number | null;
  by_session: Record<string, { r1_rate: number; n: number }> | null;
  by_regime: Record<string, { r1_rate: number; n: number }> | null;
  optimal_tp_r: number | null;
  created_at: string;
}

/** GBPUSD scalper shadow — rebuild_shadow_signals (Supabase). */
export interface RebuildShadowSignalRow {
  id: string;
  created_at: string;
  signal_time?: string | null;
  fired_at?: string | null;
  session: string | null;
  direction: string;
  entry_price: number;
  take_profit?: number | null;
  tp_price?: number | null;
  stop_loss?: number | null;
  sl_price?: number | null;
  r_size_pips?: number | null;
  r_size_raw?: number | null;
  pattern_distance?: number | null;
  resolved_at: string | null;
  final_outcome?: string | null;
  tp_hit?: boolean | null;
  tp_1r_hit?: boolean | null;
  r1_hit?: boolean | null;
  exit_within_bar1?: boolean | null;
  exit_bar?: number | null;
  pnl_r?: number | null;
  during_news_event?: string | null;
}

export interface RebuildWeeklyReportRow {
  id: string;
  created_at: string;
  week_start?: string | null;
  week_end?: string | null;
  summary_json?: unknown;
  [key: string]: unknown;
}
