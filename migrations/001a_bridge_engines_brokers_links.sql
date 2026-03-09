-- SignalForge Bridge — Table definitions (part 1 of 4)
-- Run in Supabase SQL Editor. Do NOT modify existing engine tables.

-- ─── bridge_engines ─────────────────────────────────────────────────────
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

-- ─── bridge_brokers ─────────────────────────────────────────────────────
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

-- ─── bridge_links ───────────────────────────────────────────────────────
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

-- RLS (permissive for service role)
ALTER TABLE bridge_engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access bridge_engines" ON bridge_engines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access bridge_brokers" ON bridge_brokers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access bridge_links" ON bridge_links FOR ALL USING (true) WITH CHECK (true);
