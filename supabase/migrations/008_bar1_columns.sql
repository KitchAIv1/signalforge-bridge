-- Bar1 M1 strength tracking for engine_rebuild
-- Records real-time bar1 confirmation data per executed trade
-- Zero effect on other engines

ALTER TABLE bridge_trade_log
  ADD COLUMN IF NOT EXISTS bar1_net_r    numeric,
  ADD COLUMN IF NOT EXISTS bar1_fav_r    numeric,
  ADD COLUMN IF NOT EXISTS bar1_adv_r    numeric,
  ADD COLUMN IF NOT EXISTS bar1_strength text;

COMMENT ON COLUMN bridge_trade_log.bar1_net_r IS
  'Bar1 M1 net R: favorable_r minus adverse_r.
   Positive = bar1 confirmed direction.
   Only populated for engine_rebuild trades.';

COMMENT ON COLUMN bridge_trade_log.bar1_strength IS
  'Bar1 strength bucket: strong|moderate|weak|against|no_data.
   strong = net > 0.5R, moderate = 0.2-0.5R,
   weak = 0-0.2R, against = net <= 0.
   Only populated for engine_rebuild trades.';
