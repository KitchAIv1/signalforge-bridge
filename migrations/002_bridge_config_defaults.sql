-- SignalForge Bridge — Insert ALL bridge_config defaults (25+ keys)
-- config_value is JSONB: use to_jsonb() for numbers/booleans, to_jsonb(text) for strings.
--
-- REQUIRES: bridge_config table must exist (from 001b or 000_complete_bridge_schema_and_seed.sql).
-- RECOMMENDED: Run migrations/000_complete_bridge_schema_and_seed.sql instead — it creates all tables then seeds; no ordering assumptions.
-- If running files individually: run 001a, 001b, 001c, 001d first, then this file.
-- Uses ON CONFLICT DO NOTHING so safe to re-run.

INSERT INTO bridge_config (config_key, config_value, description, category) VALUES
-- Risk
('risk_per_trade_pct', to_jsonb(0.02::numeric), 'Max 2% risk per trade', 'risk'),
('max_total_exposure_pct', to_jsonb(0.06::numeric), 'Max 6% total exposure', 'risk'),
('max_per_pair_positions', to_jsonb(2::integer), 'Max positions per pair', 'risk'),
('max_correlated_exposure', to_jsonb(2::integer), 'Max same-currency-direction positions', 'risk'),
('daily_loss_limit_pct', to_jsonb(0.05::numeric), 'Stop trading at 5% daily loss', 'risk'),
('max_consecutive_losses', to_jsonb(5::integer), 'Pause after 5 consecutive losses', 'risk'),
('cooldown_after_losses_minutes', to_jsonb(240::integer), '4-hour cooldown after loss limit', 'risk'),
('graduated_response_threshold', to_jsonb(3::integer), 'Reduce position size 50% after 3 losses', 'risk'),
('circuit_breaker_drawdown_pct', to_jsonb(0.10::numeric), 'Halt at 10% drawdown', 'risk'),
-- Signal processing
('deduplication_window_ms', to_jsonb(30000::integer), 'Ignore duplicate signals within 30s', 'signal'),
('conflict_resolution', to_jsonb('highest_score'::text), 'Opposing signals: highest score wins', 'signal'),
('max_latency_ms', to_jsonb(500::integer), 'Skip if signal-to-execution > 500ms', 'signal'),
('default_risk_reward', to_jsonb(1.5::numeric), 'Default R:R when TP missing', 'signal'),
('min_risk_reward_ratio', to_jsonb(0.5::numeric), 'Layer 1 R:R check minimum', 'signal'),
('max_order_timeout_ms', to_jsonb(10000::integer), 'OANDA order request timeout ms', 'signal'),
('stale_signal_max_age_ms', to_jsonb(60000::integer), 'Do not process signals older than this after reconnect', 'signal'),
('trade_monitor_interval_ms', to_jsonb(30000::integer), 'Trade monitor / heartbeat interval ms', 'signal'),
-- Market / infrastructure
('max_spread_multiplier', to_jsonb(2.0::numeric), 'Pause if spread > 2x normal', 'market'),
('news_blackout_enabled', to_jsonb(true::boolean), 'Pause around major news', 'market'),
('weekend_close_buffer_minutes', to_jsonb(30::integer), 'Stop new trades 30min before Friday close', 'market'),
('heartbeat_interval_ms', to_jsonb(30000::integer), 'Health check every 30s', 'system'),
-- Trade management (V1 = false)
('trailing_stop_enabled', to_jsonb(false::boolean), 'V2: trailing stops', 'trade'),
('partial_tp_enabled', to_jsonb(false::boolean), 'V2: close 50% at TP1, trail rest', 'trade'),
-- System
('kill_switch', to_jsonb(false::boolean), 'Emergency halt all trading', 'system'),
('bridge_active', to_jsonb(true::boolean), 'Master on/off', 'system'),
('log_all_decisions', to_jsonb(true::boolean), 'Log blocked signals too', 'system')
ON CONFLICT (config_key) DO NOTHING;
