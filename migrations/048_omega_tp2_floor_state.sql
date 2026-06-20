-- Omega tp2 first-peak floor ratchet state (T2=6p TP + 4p floor after peak > 4p).
-- Separate from trail_stop_state (T3 only). One row per open tp2 OANDA trade.

CREATE TABLE IF NOT EXISTS omega_tp2_floor_state (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oanda_trade_id       text NOT NULL UNIQUE,
  engine_id            text NOT NULL DEFAULT 'omega',
  pair                 text NOT NULL,
  direction            text NOT NULL,
  fill_price           numeric NOT NULL,
  floor_pips           numeric NOT NULL DEFAULT 4,
  tp_target_pips       numeric NOT NULL DEFAULT 6,
  peak_favorable_pips  numeric NOT NULL DEFAULT 0,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS omega_tp2_floor_state_trade_idx
  ON omega_tp2_floor_state (oanda_trade_id);

ALTER TABLE omega_tp2_floor_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access omega_tp2_floor_state" ON omega_tp2_floor_state;
CREATE POLICY "Service role full access omega_tp2_floor_state" ON omega_tp2_floor_state
  FOR ALL USING (true) WITH CHECK (true);
