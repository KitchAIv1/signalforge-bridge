-- Trail stop state per open OANDA trade (Charlie / charlie_shadow).
-- Persists peak_favorable across 30s trade monitor cycles.
-- RLS: same pattern as bridge_trade_log (service role / backend access).

CREATE TABLE IF NOT EXISTS trail_stop_state (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oanda_trade_id       text NOT NULL UNIQUE,
  engine_id            text NOT NULL,
  pair                 text NOT NULL,
  direction            text NOT NULL,
  entry_price          numeric NOT NULL,
  sl_distance          numeric NOT NULL,
  trail_distance       numeric NOT NULL,
  r_size_raw           numeric NOT NULL,
  peak_favorable       numeric NOT NULL DEFAULT 0,
  trail_activated      boolean NOT NULL DEFAULT false,
  activation_threshold numeric NOT NULL,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trail_stop_state_trade_idx
  ON trail_stop_state (oanda_trade_id);

ALTER TABLE trail_stop_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access trail_stop_state" ON trail_stop_state;
CREATE POLICY "Service role full access trail_stop_state" ON trail_stop_state FOR ALL USING (true) WITH CHECK (true);
