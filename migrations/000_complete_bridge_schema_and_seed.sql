-- SignalForge Bridge — COMPLETE schema and seed in one file
-- Run this single file in Supabase SQL Editor. No ordering assumptions; no other migrations need to run first.
-- Creates all bridge_* tables, then inserts config defaults, then seeds engines/brokers/links.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: TABLES (all CREATE TABLE IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- bridge_engines
CREATE TABLE IF NOT EXISTS bridge_engines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engine_id TEXT UNIQUE NOT NULL,
  engine_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_daily_trades INTEGER NOT NULL DEFAULT 10,
  trades_today INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  execution_threshold INTEGER NOT NULL,
  max_hold_hours INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bridge_engines_engine_id ON bridge_engines(engine_id);
CREATE INDEX IF NOT EXISTS idx_bridge_engines_is_active ON bridge_engines(is_active);

-- bridge_brokers
CREATE TABLE IF NOT EXISTS bridge_brokers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id TEXT UNIQUE NOT NULL,
  broker_type TEXT NOT NULL DEFAULT 'oanda',
  display_name TEXT NOT NULL,
  api_token_encrypted TEXT,
  account_id TEXT,
  environment TEXT NOT NULL DEFAULT 'practice',
  api_base_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  connection_status TEXT DEFAULT 'disconnected',
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bridge_brokers_broker_id ON bridge_brokers(broker_id);

-- bridge_links (depends on bridge_engines, bridge_brokers)
CREATE TABLE IF NOT EXISTS bridge_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engine_id TEXT NOT NULL REFERENCES bridge_engines(engine_id) ON DELETE CASCADE,
  broker_id TEXT NOT NULL REFERENCES bridge_brokers(broker_id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  capital_allocation_pct NUMERIC NOT NULL DEFAULT 0,
  custom_threshold INTEGER,
  custom_risk_pct NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(engine_id, broker_id)
);
CREATE INDEX IF NOT EXISTS idx_bridge_links_engine_broker ON bridge_links(engine_id, broker_id);

-- bridge_config
CREATE TABLE IF NOT EXISTS bridge_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bridge_config_key ON bridge_config(config_key);

-- bridge_trade_log
CREATE TABLE IF NOT EXISTS bridge_trade_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
  decision TEXT NOT NULL CHECK (decision IN ('EXECUTED', 'BLOCKED', 'SKIPPED', 'DEDUPLICATED')),
  block_reason TEXT,
  decision_latency_ms INTEGER,
  broker_id TEXT,
  oanda_order_id TEXT,
  oanda_trade_id TEXT,
  fill_price NUMERIC,
  slippage_pips NUMERIC,
  units INTEGER,
  lot_size NUMERIC,
  risk_amount NUMERIC,
  execution_latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed')),
  result TEXT CHECK (result IN ('win', 'loss', 'breakeven')),
  exit_price NUMERIC,
  pnl_pips NUMERIC,
  pnl_dollars NUMERIC,
  pnl_r NUMERIC,
  close_reason TEXT,
  closed_at TIMESTAMPTZ,
  account_equity_at_signal NUMERIC,
  total_exposure_pct NUMERIC,
  open_positions_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_engine_id ON bridge_trade_log(engine_id);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_pair ON bridge_trade_log(pair);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_status ON bridge_trade_log(status);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_created_at ON bridge_trade_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bridge_trade_log_signal_id ON bridge_trade_log(signal_id);

-- bridge_health_log, bridge_alert_log, bridge_daily_snapshot, bridge_news_events
CREATE TABLE IF NOT EXISTS bridge_health_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  oanda_ok BOOLEAN NOT NULL,
  supabase_ok BOOLEAN NOT NULL,
  broker_connection_status TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bridge_health_log_checked_at ON bridge_health_log(checked_at);

CREATE TABLE IF NOT EXISTS bridge_alert_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL,
  message TEXT,
  payload JSONB,
  webhook_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bridge_alert_log_created_at ON bridge_alert_log(created_at);

CREATE TABLE IF NOT EXISTS bridge_daily_snapshot (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  signals_received INTEGER NOT NULL DEFAULT 0,
  signals_executed INTEGER NOT NULL DEFAULT 0,
  signals_blocked INTEGER NOT NULL DEFAULT 0,
  signals_skipped INTEGER NOT NULL DEFAULT 0,
  signals_deduplicated INTEGER NOT NULL DEFAULT 0,
  pnl_dollars NUMERIC,
  pnl_r NUMERIC,
  drawdown_high_watermark NUMERIC,
  per_engine_breakdown JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bridge_news_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL,
  title TEXT,
  impact TEXT,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS on all tables
ALTER TABLE bridge_engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_trade_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_health_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_alert_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_daily_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_news_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access bridge_engines" ON bridge_engines;
CREATE POLICY "Service role full access bridge_engines" ON bridge_engines FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_brokers" ON bridge_brokers;
CREATE POLICY "Service role full access bridge_brokers" ON bridge_brokers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_links" ON bridge_links;
CREATE POLICY "Service role full access bridge_links" ON bridge_links FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_config" ON bridge_config;
CREATE POLICY "Service role full access bridge_config" ON bridge_config FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_trade_log" ON bridge_trade_log;
CREATE POLICY "Service role full access bridge_trade_log" ON bridge_trade_log FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_health_log" ON bridge_health_log;
CREATE POLICY "Service role full access bridge_health_log" ON bridge_health_log FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_alert_log" ON bridge_alert_log;
CREATE POLICY "Service role full access bridge_alert_log" ON bridge_alert_log FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_daily_snapshot" ON bridge_daily_snapshot;
CREATE POLICY "Service role full access bridge_daily_snapshot" ON bridge_daily_snapshot FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access bridge_news_events" ON bridge_news_events;
CREATE POLICY "Service role full access bridge_news_events" ON bridge_news_events FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: bridge_config defaults (25+ keys)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO bridge_config (config_key, config_value, description, category) VALUES
('risk_per_trade_pct', to_jsonb(0.02::numeric), 'Max 2% risk per trade', 'risk'),
('max_total_exposure_pct', to_jsonb(0.06::numeric), 'Max 6% total exposure', 'risk'),
('max_per_pair_positions', to_jsonb(2::integer), 'Max positions per pair', 'risk'),
('max_correlated_exposure', to_jsonb(2::integer), 'Max same-currency-direction positions', 'risk'),
('daily_loss_limit_pct', to_jsonb(0.05::numeric), 'Stop trading at 5% daily loss', 'risk'),
('max_consecutive_losses', to_jsonb(5::integer), 'Pause after 5 consecutive losses', 'risk'),
('cooldown_after_losses_minutes', to_jsonb(240::integer), '4-hour cooldown after loss limit', 'risk'),
('graduated_response_threshold', to_jsonb(3::integer), 'Reduce position size 50% after 3 losses', 'risk'),
('circuit_breaker_drawdown_pct', to_jsonb(0.10::numeric), 'Halt at 10% drawdown', 'risk'),
('deduplication_window_ms', to_jsonb(30000::integer), 'Ignore duplicate signals within 30s', 'signal'),
('conflict_resolution', to_jsonb('highest_score'::text), 'Opposing signals: highest score wins', 'signal'),
('max_latency_ms', to_jsonb(500::integer), 'Skip if signal-to-execution > 500ms', 'signal'),
('default_risk_reward', to_jsonb(1.5::numeric), 'Default R:R when TP missing', 'signal'),
('min_risk_reward_ratio', to_jsonb(0.5::numeric), 'Layer 1 R:R check minimum', 'signal'),
('max_order_timeout_ms', to_jsonb(10000::integer), 'OANDA order request timeout ms', 'signal'),
('stale_signal_max_age_ms', to_jsonb(60000::integer), 'Do not process signals older than this after reconnect', 'signal'),
('trade_monitor_interval_ms', to_jsonb(30000::integer), 'Trade monitor / heartbeat interval ms', 'signal'),
('max_spread_multiplier', to_jsonb(2.0::numeric), 'Pause if spread > 2x normal', 'market'),
('news_blackout_enabled', to_jsonb(true::boolean), 'Pause around major news', 'market'),
('weekend_close_buffer_minutes', to_jsonb(30::integer), 'Stop new trades 30min before Friday close', 'market'),
('heartbeat_interval_ms', to_jsonb(30000::integer), 'Health check every 30s', 'system'),
('trailing_stop_enabled', to_jsonb(false::boolean), 'V2: trailing stops', 'trade'),
('partial_tp_enabled', to_jsonb(false::boolean), 'V2: close 50% at TP1, trail rest', 'trade'),
('kill_switch', to_jsonb(false::boolean), 'Emergency halt all trading', 'system'),
('bridge_active', to_jsonb(true::boolean), 'Master on/off', 'system'),
('log_all_decisions', to_jsonb(true::boolean), 'Log blocked signals too', 'system')
ON CONFLICT (config_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: Seed bridge_brokers, bridge_engines, bridge_links
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO bridge_brokers (broker_id, broker_type, display_name, api_token_encrypted, account_id, environment, api_base_url, is_active)
VALUES ('oanda_practice', 'oanda', 'OANDA Practice', 'ENV:OANDA_API_TOKEN', 'FROM_ENV', 'practice', 'https://api-fxpractice.oanda.com', true)
ON CONFLICT (broker_id) DO NOTHING;

INSERT INTO bridge_engines (engine_id, engine_key, display_name, weight, is_active, max_daily_trades, priority, execution_threshold, max_hold_hours) VALUES
('alpha', 'sf_eng_' || gen_random_uuid(), 'Alpha Engine', 0.33, true, 8, 3, 56, 4),
('bravo', 'sf_eng_' || gen_random_uuid(), 'Bravo Engine', 0.00, false, 0, 0, 50, 12),
('charlie', 'sf_eng_' || gen_random_uuid(), 'Charlie Engine', 0.33, true, 10, 2, 48, 4),
('charlie2', 'sf_eng_' || gen_random_uuid(), 'Charlie2 Engine', 0.00, false, 0, 0, 48, 8),
('delta', 'sf_eng_' || gen_random_uuid(), 'Delta Engine', 0.34, true, 6, 1, 58, 4)
ON CONFLICT (engine_id) DO NOTHING;

INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct) VALUES
('alpha', 'oanda_practice', true, 0.330),
('charlie', 'oanda_practice', true, 0.330),
('delta', 'oanda_practice', true, 0.340)
ON CONFLICT (engine_id, broker_id) DO NOTHING;
