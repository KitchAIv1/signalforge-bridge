-- Bar1 M1 strength columns for engine_rebuild
-- Tracks real-time bar1 confirmation per executed trade
-- Zero effect on other engines

ALTER TABLE bridge_trade_log
  ADD COLUMN IF NOT EXISTS bar1_net_r    numeric,
  ADD COLUMN IF NOT EXISTS bar1_fav_r    numeric,
  ADD COLUMN IF NOT EXISTS bar1_adv_r    numeric,
  ADD COLUMN IF NOT EXISTS bar1_strength text;
