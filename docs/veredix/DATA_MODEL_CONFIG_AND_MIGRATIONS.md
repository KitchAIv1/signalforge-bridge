# Data Model Config And Migrations

## Supabase Role

Supabase is the shared control and audit plane. Engines write source signals, the bridge reads and writes bridge-owned operational tables, and the dashboard reads or updates a constrained set of rows through anon RLS policies.

## Core Tables

| Table | Purpose |
| --- | --- |
| `signals` | Engine-owned signal bus consumed by bridge Realtime subscription. |
| `bridge_engines` | Engine registry, active flag, thresholds, weights, daily counts, max hold. |
| `bridge_brokers` | Broker registry and connection status. Schema-ready for multi-broker, runtime OANDA-only today. |
| `bridge_links` | Engine-to-broker allocation schema. Not used for runtime order routing today. |
| `bridge_config` | JSONB config keys for risk, runtime controls, system flags, and dashboard controls. |
| `bridge_trade_log` | Primary audit table for signals, decisions, fills, outcomes, intelligence fields, and tags. |
| `bridge_health_log` | Heartbeat and health history. |
| `bridge_alert_log` | Alert/event log foundation. |
| `bridge_daily_snapshot` | Daily snapshot foundation. |
| `bridge_news_events` or `news_events` | News/event data used by bridge and dashboard, depending on migration path. |
| `trail_stop_state` | Persistent trailing-stop state. |
| `regime_state` | H4/D1 regime snapshots for AUD_USD. |
| `amd_state` | Daily AMD snapshot for AUD_USD. |
| `amd_m5_distribution_candles` | Stored M5 candle payloads for AMD distribution analysis. |
| `intelligence_snapshots` | Dashboard Intelligence evaluation snapshots. |

## Shadow Tables

Referenced but not fully created by this repo:

- `rebuild_shadow_signals`
- `rebuild_shadow_weekly_report`
- `omega_shadow_signals`
- `omega_shadow_weekly_report`

These are research or engine-owned sources. Product docs should not assume the bridge owns their schema until migrations are added.

## Migration Map

| Migration | Purpose |
| --- | --- |
| `000_complete_bridge_schema_and_seed.sql` | One-shot schema and seed for base bridge tables/config/engines. |
| `001a_bridge_engines_brokers_links.sql` | Engine, broker, and link tables. |
| `001b_bridge_config.sql` | Config table and base service-role policy. |
| `001c_bridge_trade_log.sql` | Primary trade audit table. |
| `001d_bridge_health_alert_snapshot_news.sql` | Health, alerts, snapshots, and news tables. |
| `002_bridge_config_defaults.sql` | Base config defaults. |
| `003_seed_engines_links.sql` | Base engine and broker link seeds. |
| `004_dashboard_rls.sql` | Dashboard anon reads and bridge/kill switch updates. |
| `005_bridge_trade_log_duration_minutes.sql` | Trade duration field. |
| `006_seed_falcon_engine.sql` | Falcon engine seed. |
| `007_trail_stop_state.sql` | Trail-stop state table. |
| `008_bar1_columns.sql` | Bar1 fields on trade log, present under `supabase/migrations`. |
| `009_rebuild_bounds_retry.sql` | Rebuild bounds retry config and dashboard policy expansion. |
| `010_rebuild_hour_gate.sql` | Rebuild hour gate config and dashboard policy expansion. |
| `011_regime_state.sql` | Regime state table and trade-log regime fields. |
| `012_regime_state_layer7.sql` | Layer 7 regime fields. |
| `013_dashboard_tagging_and_news_rls.sql` | Trade tags and news RLS. |
| `014_amd_intelligence.sql` | AMD state and basic trade-log AMD columns. |
| `015_amd_daily_bias.sql` | D1 bias additions for AMD. |
| `016_amd_auto_direction.sql` | AMD auto direction, direction source, size multiplier, and `direction_mode`. |
| `017_amd_trade_log_audit.sql` | Expanded AMD audit columns on trade log. |
| `018_amd_m5_distribution_candles.sql` | M5 distribution candle storage. |

Known gap: `migrations/` and `supabase/migrations/` overlap for some files. The production canonical migration path should be decided and documented.

## Base Config Keys

Base keys from `002_bridge_config_defaults.sql`:

| Key | Default | Purpose |
| --- | --- | --- |
| `risk_per_trade_pct` | `0.02` | Base per-trade risk. |
| `max_total_exposure_pct` | `0.06` | Total exposure cap. |
| `max_per_pair_positions` | `2` | Same-pair open-position cap. |
| `max_correlated_exposure` | `2` | Same-currency-direction cap. |
| `daily_loss_limit_pct` | `0.05` | Daily loss limit setting. |
| `max_consecutive_losses` | `5` | Circuit breaker loss threshold. |
| `cooldown_after_losses_minutes` | `240` | Cooldown after loss threshold. |
| `graduated_response_threshold` | `3` | Consecutive losses before sizing reduction. |
| `circuit_breaker_drawdown_pct` | `0.10` | Drawdown halt threshold. |
| `deduplication_window_ms` | `30000` | Historical dedup window; code currently disabled. |
| `conflict_resolution` | `highest_score` | Intended conflict strategy. |
| `max_latency_ms` | `500` | Skip delayed processing. |
| `default_risk_reward` | `1.5` | TP fallback R:R. |
| `min_risk_reward_ratio` | `0.5` | Minimum R:R if checked. |
| `max_order_timeout_ms` | `10000` | OANDA order request timeout. |
| `stale_signal_max_age_ms` | `60000` | Stale signal skip threshold. |
| `trade_monitor_interval_ms` | `30000` | Trade monitor interval. |
| `max_spread_multiplier` | `2.0` | Spread limit setting. |
| `news_blackout_enabled` | `true` | News logic enablement. |
| `weekend_close_buffer_minutes` | `30` | Friday close buffer. |
| `heartbeat_interval_ms` | `30000` | Heartbeat interval. |
| `trailing_stop_enabled` | `false` | Trail-stop feature flag. |
| `partial_tp_enabled` | `false` | Reserved partial TP flag. |
| `kill_switch` | `false` | Emergency halt. |
| `bridge_active` | `true` | Master active flag. |
| `log_all_decisions` | `true` | Log blocked decisions. |

## Extended Config Keys

| Key | Purpose |
| --- | --- |
| `paused_engines` | Dashboard-controlled list of paused engines. |
| `omega_direction` | `long` or `short` execution direction override for Omega. |
| `rebuild_bounds_retry` | Retry Rebuild order without price bound after bounds violation. |
| `rebuild_hour_gate_enabled` | Toggle bad-hour block for Rebuild. |
| `direction_mode` | `manual` or `auto` Omega direction mode. |
| `presence_last_seen` | Dashboard presence heartbeat while Activity is open. |

## Environment Variables

Bridge:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `OANDA_API_TOKEN`
- `OANDA_ACCOUNT_ID`
- `OANDA_ENVIRONMENT`
- `SIGNAL_TABLE`
- `TRAIL_STOP_ENABLED`
- `TRAIL_STOP_ENGINE_IDS`
- `TRAIL_STOP_SL_MULTIPLIER`
- `TRAIL_STOP_TRAIL_DISTANCE`
- `REBUILD_DIRECTION_FLIP`

Dashboard:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

Security requirement: examples must use placeholders only. Do not commit real tokens, anon keys tied to production, or account IDs.

## RLS Model

Service role policies are broad so the bridge can operate. Dashboard anon policies allow read access to operational tables and limited writes:

- `bridge_config` updates for approved control keys.
- `bridge_trade_log` tag columns through column grants.
- News table read access where present.

Known gap: no user identity is recorded with dashboard writes because there is no authentication layer.

## Trade Log Audit Domains

`bridge_trade_log` accumulates multiple audit domains:

- Source signal fields.
- Decision and block reason.
- OANDA IDs, fill, units, status.
- Close details and derived P&L.
- Account/exposure snapshot.
- Rebuild bar1 fields.
- Regime fields.
- AMD fields.
- Manual and close tags.
- Pre-entry, intra-trade, and post-exit candles for Omega paths.

This table is the primary source for Activity, Calendar, Intelligence, and research feedback loops.
