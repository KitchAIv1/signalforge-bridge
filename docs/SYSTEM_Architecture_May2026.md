# System Architecture — May 2026

**SignalForge / Veredix Bridge**
**Supplements:** [docs/veredix/SYSTEM_ARCHITECTURE.md](veredix/SYSTEM_ARCHITECTURE.md) (context diagram, startup flow, dashboard routes)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-18 | AO live posture v1.2.1 — pure sizing ON, giveback ON, omega.weight 0.25 (migration `062`) |
| 2026-07-17 | Docs refresh v1.2.0 — ALPHAOMEGA Lane B, dual-OANDA, giveback trail; see [CHANGELOG_July2026.md](./CHANGELOG_July2026.md) |
| 2026-07-13 | Lane A RAW pure sizing + 1.5p peak giveback trail; migration 059 |
| 2026-07-09 | Lane B rewired to ALPHAOMEGA (streak-crack entry / multi-exit); migration 057 |
| 2026-07-08 | AMD dedicated OANDA account + pip trail 2.5→5; migration 056 |
| 2026-07-07 | Dual-OANDA Lane B (`oanda_phase2_demo`); migration 055 |
| 2026-07-03 | OMEGA max_hold reduced 6h → 3h (180m best setup); migration 054 |
| 2026-05-31 | Initial May 2026 architecture snapshot |

---

## 1. System Overview

SignalForge Bridge is a Node.js runtime on Railway that subscribes to Supabase `signals`, validates and sizes trades, executes on OANDA fxTrade v20, and runs scheduled intelligence services (AMD detection, regime detection, Asian direction, distribution engine, scalper). A Next.js dashboard on Vercel reads/writes operational Supabase tables. External engines (Omega, Falcon, Sigma, etc.) emit signals; the bridge is the execution authority.

---

## 2. Infrastructure

| Component | Role |
|-----------|------|
| **Railway** | Node.js bridge process (`npm start`), all crons and Realtime subscriptions |
| **Supabase** | PostgreSQL — signals bus, config, engines, trade log, AMD/regime/scalper state |
| **Vercel** | Next.js 14 dashboard (`dashboard/`, port 3001 local) — operator UI, no auth layer |
| **OANDA fxTrade v20 REST** | Live execution, candle fetches, account summary (`src/connectors/oanda.ts`) |

---

## 3. Complete Cron Timeline (UTC)

All cron strings from `src/index.ts`. `{ timezone: 'UTC' }` on every `cron.schedule`.

### Fixed daily / weekday schedule

| UTC time | Cron string | Service |
|----------|-------------|---------|
| **00:05** | `'5 0,4,8,12,16,20 * * *'` | Regime detector (1 of 6) |
| **04:05** | `'5 0,4,8,12,16,20 * * *'` | Regime detector (2 of 6) |
| **08:00** | `'0 8 * * *'` | Asian session close — `runAsianSessionClose()` |
| **08:05** | `'5 8 * * 1-5'` | Asian M5 candle fetch — `fetchTodayAsianCandles()` |
| **08:05** | `'5 0,4,8,12,16,20 * * *'` | Regime detector (3 of 6) |
| **10:31** | `'31 10 * * *'` | AMD detection — `runAmdDetection()` |
| **10:32** | `'32 10 * * 1-5'` | Scalper init — `initializeDayState()` *(if `SCALPER_ENABLED=true`)* |
| **10:37** | `'37 10 * * 1-5'` | Scalper init retry |
| **10:42** | `'42 10 * * 1-5'` | Scalper init retry |
| **12:05** | `'5 0,4,8,12,16,20 * * *'` | Regime detector (4 of 6) |
| **16:00** | `'0 16 * * 1-5'` | Scalper hard close — `hardClose()` *(if enabled)* |
| **16:30** | `'30 16 * * *'` | AMD outcome detection — `runAmdOutcomeDetection()` |
| **16:05** | `'5 0,4,8,12,16,20 * * *'` | Regime detector (5 of 6) |
| **20:05** | `'5 0,4,8,12,16,20 * * *'` | Regime detector (6 of 6) |
| **21:10** | `'10 21 * * *'` | Asian direction set — `runAsianDirectionSet()` |

### Continuous intervals

| Interval | Mechanism | Service |
|----------|-----------|---------|
| **Every 5 min** | `'*/5 * * * *'` | AMD Distribution — `AmdDistributionEngine.checkAndExecute()` |
| **Every 30 s** | `setInterval(30000)` | Trade monitor — `runTradeMonitor()` |
| **Every 30 s** | `setInterval(30000)` | Heartbeat — `runHeartbeat()` |
| **Every 30 s** | `setInterval(30000)` | AMD trail monitor — `runAmdTrailMonitor()` |
| **Every 30 s** | `setInterval(30000)` | ALPHAOMEGA hard-stop / giveback — `runAlphaOmegaHardStopMonitor()` *(Lane B)* |
| **Every 30 s** | `setInterval(30000)` | Scalper monitors — `runMonitors()` *(if enabled)* |
| **UTC midnight** | `scheduleMidnightReset()` | Reset `bridge_engines.trades_today` |

### Startup conditionals

| Condition | Action |
|-----------|--------|
| After 10:31 UTC | `runAmdDetection()` once on boot |
| After 16:30 UTC | `runAmdOutcomeDetection()` once on boot |
| Always | `runRegimeDetection()` once on boot |
| Never | `runAsianDirectionSet()` on boot (removed — was corrupting valid_until) |

---

## 4. Engine Inventory

From `bridge_engines` query (2026-05-31). `paused_engines` in `bridge_config`: `["falcon", "engine_rebuild"]`.

| engine_id | display_name | is_active | paused | max_hold_h | Entry trigger | Exit | Primary tables |
|-----------|--------------|-----------|--------|------------|---------------|------|----------------|
| **omega** (Lane A) | Engine Omega — AUDUSD M5 DTW Pattern | true | no | 3 | External signal → Realtime → `oanda_practice` | RAW + optional 1.5p peak giveback (`059`); max_hold 3h | `signals`, `bridge_trade_log` |
| **omega** (Lane B / ALPHAOMEGA) | Same signal, Phase-2 account | true | no | 3 | Streak-crack entry on `oanda_phase2_demo` | Opposing 5 / share / 10p hard / backstop / optional 6p→3p giveback | `alpha_omega_*`, `bridge_trade_log` |
| **engine_amd** | AMD Distribution | true | no | 6 | Tag entry hour + AMD state (`AmdDistributionEngine`, every 5 min) | Pip trail (5p) + tag hard exit hour; dedicated OANDA account | `amd_state`, `bridge_trade_log` |
| **engine_rebuild** | Engine Rebuild | true | **yes (decommissioning)** | 0.5 | External signal (paused) | M15 max hold | `signals`, `bridge_trade_log`, shadow tables |
| **falcon** | Falcon | true | **yes** | 2 | External signal | max hold | `signals`, `bridge_trade_log` |
| **sigma** | Sigma | true | no | 2 | External signal | max hold | `signals`, `bridge_trade_log` |
| **scalper** | *(bridge-native, not in bridge_engines)* | env-gated | — | 16:00 hard | Price-ratchet pullback 10:00–16:00 | TP/SL/ratchet, 16:00 hard close | `scalper_day_state`, `scalper_trades`, `bridge_trade_log` |
| alpha, bravo, charlie, charlie2, charlie_shadow, delta | Legacy engines | false | — | varies | — | — | `signals` |

**Scalper:** Not a `bridge_engines` row. Activated only when `SCALPER_ENABLED=true` on Railway.

---

## 5. Data Flow Diagram

```
OANDA candles
     │
     ▼
┌─────────────────┐     10:31 UTC      ┌──────────────┐
│  AmdDetector    │ ─────────────────► │  amd_state   │
│  Service        │     16:30 UTC      │  (daily row) │
└─────────────────┘ ─ outcome ────────►└──────┬───────┘
                                              │
     21:10 UTC (AMD_SHIFTED)                  │
┌─────────────────┐                           │
│ AsianDirection  │──► bridge_config          │
│ Service         │    .omega_direction       │
└─────────────────┘                           │
                                              ▼
                                     ┌────────────────────┐
                                     │ AmdDistribution    │
                                     │ Engine (*/5 min)   │
                                     │ AMD_DISTRIBUTION_  │
                                     │ ENABLED=true       │
                                     └─────────┬──────────┘
                                               │ OANDA market order
                                               ▼
                                     ┌────────────────────┐
                                     │ bridge_trade_log   │
                                     │ engine_id=engine_amd│
                                     └────────────────────┘

amd_state (AGREE/NEUTRAL gate)
     │
     ▼ 10:32–10:42 UTC init + 30s monitors
┌─────────────────┐
│ ScalperEngine   │──► scalper_trades ──sync──► bridge_trade_log
│ SCALPER_ENABLED │
└─────────────────┘

External engines ──► signals (Realtime) ──► signalRouter ──► OANDA ──► bridge_trade_log
                              │
                              ├── regime_state (Omega sizing advisory)
                              └── bridge_config (direction, paused_engines, kill_switch)
```

---

## 6. Key Tables Reference

| Table | One-line description |
|-------|---------------------|
| `signals` | Engine signal bus; bridge Realtime subscriber |
| `bridge_config` | Runtime flags, omega_direction, paused_engines, risk settings |
| `bridge_engines` | Engine registry, weights, max hold, trades_today |
| `bridge_trade_log` | All execution audit — open/closed/blocked/skipped |
| `bridge_health_log` | Heartbeat history |
| `amd_state` | Daily AMD tag, auto_direction, Asian close bias, outcomes |
| `amd_m5_distribution_candles` | Distribution window M5 JSONB |
| `asian_m5_candles` | Asian session M5 JSONB (00:00–08:00 UTC) |
| `asian_direction_log` | Asian direction automation audit |
| `regime_state` | H4 regime snapshots for AUD_USD |
| `scalper_day_state` | Scalper daily reference/trigger/ratchet state |
| `scalper_trades` | Scalper per-trade audit |
| `trail_stop_state` | Persistent trailing-stop state |
| `alpha_omega_streak_state` | ALPHAOMEGA singleton streak machine (Lane B) |
| `alpha_omega_position_state` | ALPHAOMEGA open Lane B position tracking |
| `news_events` | News blackout data |
| `rebuild_shadow_signals` | Rebuild research (decommissioning) |

---

## 7. Environment Variables

Grouped by service. All read at runtime from Railway env.

### Bridge core

| Variable | Default | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | — | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` | — | Bridge DB access |
| `SIGNAL_TABLE` | `signals` | Realtime subscription table |
| `OANDA_API_TOKEN` | — | Broker auth |
| `OANDA_ACCOUNT_ID` | — | Primary / Lane A account routing |
| `OANDA_PHASE2_ACCOUNT_ID` | — | Lane B (`oanda_phase2_demo`) account |
| `OANDA_ENVIRONMENT` | `practice` | `practice` or `live` |
| `LOG_LEVEL` | `info` | Logger verbosity |
| `ALERT_WEBHOOK_URL` | — | Monitoring webhook |

### Omega / signal router

| Variable | Default | Purpose |
|----------|---------|---------|
| `OMEGA_DIRECTION_OVERRIDE` | `long` | Fallback when direction_mode ≠ manual and no DB value |
| `TRAIL_STOP_ENABLED` | — | `'true'` enables trail stops |
| `TRAIL_STOP_ENGINE_IDS` | — | Comma-separated engine IDs |
| `TRAIL_STOP_SL_MULTIPLIER` | `1.5` | SL multiplier |
| `TRAIL_STOP_TRAIL_DISTANCE` | `1.5` | Default trail distance |
| `TRAIL_STOP_TRAIL_DISTANCE_OMEGA` | `0.5` | Omega-specific trail |
| `TRAIL_STOP_ACTIVATION_R` | `0.0` | R-multiple activation |
| `REBUILD_DIRECTION_FLIP` | — | `'true'` flips rebuild direction (decommissioning) |

### AMD

| Variable | Default | Purpose |
|----------|---------|---------|
| `AMD_DISTRIBUTION_ENABLED` | — | `'true'` enables distribution engine |
| `AMD_ASIAN_CLOSE_FILTER_ENABLED` | — | `'true'` blocks distribution on Asian close disagree |
| `AMD_CONFLICTED_WEAK_D1_JUDAS_ENABLED` | — | `'true'` enables conflicted weak D1 Judas path |

### Scalper

| Variable | Default | Purpose |
|----------|---------|---------|
| `SCALPER_ENABLED` | — | `'true'` registers scalper crons |
| `SCALPER_PAIR` | `AUD_USD` | Instrument |
| `SCALPER_PULLBACK_PIPS` | `5` | Entry pullback |
| `SCALPER_TP_PIPS` | `10` | Take profit |
| `SCALPER_SL_PIPS` | `10` | Stop loss |
| `SCALPER_MAX_RATCHETS` | `3` | Max ratchets per day |
| `SCALPER_RISK_PCT` | `0.01` | Risk per trade |

### Alerts

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Asian session Telegram alerts |
| `TELEGRAM_CHAT_ID` | Alert chat ID |

### Dashboard (Vercel, separate deploy)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon RLS access |
| `ANTHROPIC_API_KEY` | `/api/intelligence-eval` only |

---

## 8. Known Gaps

| Gap | Status |
|-----|--------|
| **Engine Rebuild** | Being decommissioned. Paused via `paused_engines`. Documented historically in [ENGINE_REBUILD.md](ENGINE_REBUILD.md); no further investment. |
| **Asian scalper** | Infrastructure ready (`asian_m5_candles`, backtests validated). Not deployed as a production engine. |
| **`asian_session_result`** | Column on `asian_direction_log` never populated by `runAsianSessionClose()`. |
| **AMD 13:00 second evaluation** | Proposed in research; no cron or code in `src/index.ts`. |
| **`regime_log` table** | [VERIFY] Not in repo migrations; Supabase table empty / schema mismatch with expected `evaluated_at`. |
| **Deduplication** | Disabled in `signalRouter.ts` for testing. |
| **Scalper vs backtest cohort** | Live engine arms on NEUTRAL (`15b77b7`); AGREE-only backtest cohort differs. |

---

## Related Documentation

| Doc | Topic |
|-----|-------|
| [SERVICE_AsianDirection_Reference_May2026.md](SERVICE_AsianDirection_Reference_May2026.md) | Asian direction automation |
| [SERVICE_RegimeDetector_Reference_May2026.md](SERVICE_RegimeDetector_Reference_May2026.md) | Regime detector layers |
| [SERVICE_AsianM5Candles_May2026.md](SERVICE_AsianM5Candles_May2026.md) | Asian M5 fetch |
| [ENGINE_Scalper_Reference_v1_0_0_May2026.md](ENGINE_Scalper_Reference_v1_0_0_May2026.md) | Scalper engine |
| [AMD_SYSTEM_REFERENCE.md](AMD_SYSTEM_REFERENCE.md) | AMD detector and tags |
| [veredix/ENGINE_AND_SIGNAL_LOGIC.md](veredix/ENGINE_AND_SIGNAL_LOGIC.md) | Omega direction chain |
