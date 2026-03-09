/** Normalized signal from Realtime payload; decision and trade log types. */

export type DecisionType = 'EXECUTED' | 'BLOCKED' | 'SKIPPED' | 'DEDUPLICATED';

export interface NormalizedSignal {
  signalId: string;
  engineId: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  confluenceScore: number;
  regime?: string;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  stopLoss: number;
  takeProfit: number | null;
  createdAt: string;
}

export interface TradeLogRow {
  signal_id: string;
  engine_id: string;
  pair: string;
  direction: string;
  confluence_score: number | null;
  regime: string | null;
  entry_zone_low: number | null;
  entry_zone_high: number | null;
  entry_price: number | null;
  stop_loss: number;
  take_profit: number | null;
  signal_received_at: string;
  decision: DecisionType;
  block_reason: string | null;
  decision_latency_ms: number | null;
  broker_id: string | null;
  oanda_order_id: string | null;
  oanda_trade_id: string | null;
  fill_price: number | null;
  slippage_pips: number | null;
  units: number | null;
  lot_size: number | null;
  risk_amount: number | null;
  execution_latency_ms: number | null;
  status: 'pending' | 'open' | 'closed';
  result: 'win' | 'loss' | 'breakeven' | null;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_dollars: number | null;
  pnl_r: number | null;
  close_reason: string | null;
  closed_at: string | null;
  account_equity_at_signal: number | null;
  total_exposure_pct: number | null;
  open_positions_count: number | null;
  notes: string | null;
}
