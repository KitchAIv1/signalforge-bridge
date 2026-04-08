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
