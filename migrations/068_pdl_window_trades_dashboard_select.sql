-- Migration 068: ensure dashboard anon can SELECT pdl_window_trades.
-- GRANT alone is insufficient if RLS is enabled without a policy.

ALTER TABLE pdl_window_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_pdl_window_trades" ON pdl_window_trades;
CREATE POLICY "dashboard_select_pdl_window_trades"
  ON pdl_window_trades
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON pdl_window_trades TO anon, authenticated;
