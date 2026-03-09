-- SignalForge Bridge — bridge_config table (part 2 of 4)
-- config_value is JSONB: numbers as JSON numbers, booleans as JSON booleans, strings as JSON strings.

CREATE TABLE IF NOT EXISTS bridge_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_config_key ON bridge_config(config_key);

ALTER TABLE bridge_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access bridge_config" ON bridge_config FOR ALL USING (true) WITH CHECK (true);
