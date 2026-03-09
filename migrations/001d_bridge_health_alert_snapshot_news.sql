-- SignalForge Bridge — health, alert, daily snapshot, news (part 4 of 4)

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

ALTER TABLE bridge_health_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_alert_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_daily_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_news_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access bridge_health_log" ON bridge_health_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access bridge_alert_log" ON bridge_alert_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access bridge_daily_snapshot" ON bridge_daily_snapshot FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access bridge_news_events" ON bridge_news_events FOR ALL USING (true) WITH CHECK (true);
