-- AMD exit stack recalibration — three independent kill-switched levers.
-- All defaults preserve current live behavior exactly; flip via dashboard /
-- SQL, no redeploy. Derived from 49-trade live replay on OANDA M5 paths
-- (scripts/amdDurationCrackAnalysis.ts, amdDeadTradeAbortGrid.ts,
--  amdTrailWidthGridSim.ts, amdReplayFidelityCheck.ts):
--   abort 60m/4p:   book -100.7p -> +12.7p (trail 5/5 held constant)
--   + trail 6/4:    -> +39.2p
--   + hard SL 10:   -> +55.7p (plus 1.5x units per $ risk from SL sizing)

-- Lever 1: dead-trade abort. At >=60m hold with peak favorable < 4p the
-- 5p trail can never arm; 15/15 such live trades lost (-197.3p, -$15,292).
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'amd_dead_trade_abort_enabled',
  to_jsonb(false),
  'When true, engine_amd closes any open trade that is >=60 minutes old and has never reached 4 pips favorable (close_reason=dead_trade_abort). Checked LAST after time gate and pip trail, same 30s monitor cycle. Shadow would_abort logs while off. Live evidence: 15/15 such trades lost. Default off.',
  'amd'
)
ON CONFLICT (config_key) DO NOTHING;

-- Lever 2: trail arm/giveback split. Legacy trail uses one distance (5) for
-- both arming and giveback. Replay grid: arm 6 / giveback 4 is the robust
-- optimum (giveback 4 wins across arm 4-6; wide trails 8-10 are -87p).
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'amd_trail_split_enabled',
  to_jsonb(false),
  'When true, engine_amd pip trail arms at 6 pips peak gain and exits 4 pips behind peak (replay: +26.5p vs coupled 5/5 on identical paths). When false, legacy behavior: per-trade trail_pip_distance used for both arm and giveback. Default off.',
  'amd'
)
ON CONFLICT (config_key) DO NOTHING;

-- Lever 3: hard SL distance (pips). Applies to NEW trades only: broker-side
-- SL at placement and position sizing (units = risk / SL). Live evidence for
-- 10: zero of 26 winners exceeded 9.3p adverse; replay +16.5p vs SL15 plus
-- 1.5x sizing. Change to 10 only after abort+trail prove out live.
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'amd_hard_sl_pips',
  to_jsonb(15),
  'Hard stop-loss distance in pips for new engine_amd trades (broker SL + sizing denominator). Valid 3-50; invalid/missing falls back to 15. Monitor R-math derives each trade''s SL from its own stored hard_sl_price, so mixed-SL books stay accurate. Current live value 15; validated target 10.',
  'amd'
)
ON CONFLICT (config_key) DO NOTHING;
