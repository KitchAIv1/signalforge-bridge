-- SignalForge Bridge — bridge_trade_log (part 3 of 4)
-- Immutable audit trail: signal fields, decision, execution, outcome, snapshot.

CREATE TABLE IF NOT EXISTS bridge_trade_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Signal
  signal_id UUID NOT NULL,
  engine_id TEXT NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL,
  confluence_score NUMERIC,
  regime TEXT,
  entry_zone_low NUMERIC,
  entry_zone_high NUMERIC,
  entry_price NUMERIC,
  stop_loss NUMERIC NOT NULL,
  take_profit NUMERIC,
  signal_received_at TIMESTAMPTZ NOT NULL,
  -- Decision
  decision TEXT NOT NULL CHECK (decision IN ('EXECUTED', 'BLOCKED', 'SKIPPED', 'DEDUPLICATED')),
  block_reason TEXT,
  decision_latency_ms INTEGER,
  -- Execution (when EXECUTED)
  broker_id TEXT,
  oanda_order_id TEXT,
  oanda_trade_id TEXT,
  fill_price NUMERIC,
  slippage_pips NUMERIC,
  units INTEGER,
  lot_size NUMERIC,
  risk_amount NUMERIC,
  execution_latency_ms INTEGER,
  -- Outcome
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed')),
  result TEXT CHECK (result IN ('win', 'loss', 'breakeven')),
  exit_price NUMERIC,
  pnl_pips NUMERIC,
  pnl_dollars NUMERIC,
  pnl_r NUMERIC,
  close_reason TEXT,
  closed_at TIMESTAMPTZ,
  -- Snapshot at signal time
  account_equity_at_signal NUMERIC,
  total_exposure_pct NUMERIC,
  open_positions_count INTEGER,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_engine_id ON bridge_trade_log(engine_id);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_pair ON bridge_trade_log(pair);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_status ON bridge_trade_log(status);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_created_at ON bridge_trade_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_signal_id ON bridge_trade_log(signal_id);

ALTER TABLE bridge_trade_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access bridge_trade_log" ON bridge_trade_log FOR ALL USING (true) WITH CHECK (true);
