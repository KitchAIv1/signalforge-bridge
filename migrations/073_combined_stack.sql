-- Migration 073: Combined Stack — AO AMD-day gate + AMD engine mirrored on VT.
-- Everything ships OFF/inactive; flipping is via dashboard or SQL, no redeploy.
-- Evidence (45-day causal counterfactual, Aug 2026):
--   AO with AMD_FAILED-day gate: -98.3p -> +34.6p (gate only applies to
--   entries at/after the 10:31 UTC amd_state tag write; pre-tag entries kept).
--   AMD with 072 exit stack replayed on same window: -6.1p -> +74.0p.

-- Gate 1: AO skips new entries when today's amd_state.amd_tag = 'AMD_FAILED'
-- and the signal fires at/after the tag write time. Fail-open on any read
-- error. Shadow-logs would-be blocks while off.
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'alpha_omega_amd_day_gate_enabled',
  to_jsonb(false),
  'When true, AlphaOmega skips new entries on days the AMD detector tagged AMD_FAILED, only for signals at/after the 10:31 UTC tag write (no look-ahead). Fail-open: missing amd_state row or read error = trade normally. Shadow-logs blocks while off. Default off.',
  'alpha_omega'
)
ON CONFLICT (config_key) DO NOTHING;

-- Switch 2: AMD engine mirrors entries onto the VT Markets MT5 live account
-- (same MetaApi account AO uses; account confirmed hedging mode).
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'amd_vt_mirror_enabled',
  to_jsonb(false),
  'When true, engine_amd mirrors each OANDA entry onto vtmarkets_ao_live via MetaApi (magic 88005), sized against VT equity x amd_vt_size_multiplier, with broker-side SL. Requires the engine_amd->vtmarkets_ao_live bridge_link to be active. Default off.',
  'amd'
)
ON CONFLICT (config_key) DO NOTHING;

-- Knob 3: VT-leg-only size multiplier, independent of AO sizing and of
-- AMD-on-OANDA sizing. 0.05 default keeps the validation phase at/near the
-- 0.01-lot broker minimum.
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'amd_vt_size_multiplier',
  to_jsonb(0.05),
  'Multiplier applied ONLY to the engine_amd VT mirror leg sizing (on top of the shared AMD risk formula against VT equity). Does not affect AO or AMD-on-OANDA. Valid 0.01-2; invalid falls back to 0.05. Raise after the 0.01-lot validation week.',
  'amd'
)
ON CONFLICT (config_key) DO NOTHING;

-- Routing: engine_amd -> VT link, inactive until deliberately flipped.
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'engine_amd', 'vtmarkets_ao_live', false, 1.0
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'vtmarkets_ao_live')
ON CONFLICT (engine_id, broker_id) DO NOTHING;

-- Venue-aware trail state: without this the AMD monitor would treat a VT
-- position id as an OANDA trade and false-flag it externally closed.
ALTER TABLE amd_trail_stop_state
  ADD COLUMN IF NOT EXISTS broker_id TEXT NOT NULL DEFAULT 'oanda_amd_demo';
