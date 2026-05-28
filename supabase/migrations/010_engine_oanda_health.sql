CREATE TABLE IF NOT EXISTS engine_oanda_health (
  service TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ,
  consecutive_failures INT NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed rows so dashboard always has data to display
INSERT INTO engine_oanda_health (service, status, last_attempt_at, consecutive_failures)
VALUES
  ('omega',   'unknown', NOW(), 0),
  ('rebuild', 'unknown', NOW(), 0)
ON CONFLICT (service) DO NOTHING;
