# SignalForge Bridge — Technical Reference

**Version:** 1.0.0  
**Repo:** `KitchAIv1/signalforge-bridge`  
**Deployment:** Railway (auto-deploy on push to `main`)  
**Last Updated:** March 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Signal Processing Pipeline](#3-signal-processing-pipeline)
4. [Engine Configuration](#4-engine-configuration)
5. [Position Sizing](#5-position-sizing)
6. [TP and SL Execution](#6-tp-and-sl-execution)
7. [Trade Monitoring and Exit](#7-trade-monitoring-and-exit)
8. [Bridge Config Reference](#8-bridge-config-reference)
9. [Database Tables](#9-database-tables)
10. [Environment Variables](#10-environment-variables)
11. [Supported Instruments](#11-supported-instruments)
12. [Known Bug Fixes Changelog](#12-known-bug-fixes-changelog)
13. [Current Technical Status](#13-current-technical-status)
14. [Deployment Guide](#14-deployment-guide)

---

## 1. Overview

SignalForge Bridge is a standalone **Node.js/TypeScript** service that acts as the execution layer between trading signal engines and the OANDA brokerage API. It does not generate signals — it receives them, validates them, applies risk management, and places orders.

**Separation of responsibilities:**

| Component | Role | Owned by |
|---|---|---|
| Engines (alpha, charlie, delta) | Generate signals based on market analysis | Engine services |
| Supabase `signals` table | Signal delivery channel | Shared |
| **SignalForge Bridge** | Risk management, position sizing, order execution | This service |
| OANDA v20 API | Order placement and trade management | Broker |
| Dashboard UI | Monitoring and settings | `dashboard/` subdirectory |

**The Bridge never writes to `signals` or `signal_outcomes`.** All Bridge state lives in `bridge_*` tables.

---

## 2. Architecture

```
┌─────────────┐     INSERT      ┌──────────────────┐
│   Engine    │ ─────────────► │  signals table   │
│(alpha/      │                 │  (Supabase)      │
│ charlie/    │                 └────────┬─────────┘
│ delta)      │                          │ Realtime INSERT event
└─────────────┘                          │
                                         ▼
                               ┌──────────────────┐
                               │  SignalForge     │
                               │  Bridge          │◄─── bridge_config
                               │  (Railway)       │◄─── bridge_engines
                               └────────┬─────────┘
                                        │
                     ┌──────────────────┼──────────────────┐
                     │                  │                  │
                     ▼                  ▼                  ▼
              ┌──────────┐    ┌──────────────┐    ┌──────────────┐
              │  OANDA   │    │bridge_trade  │    │  Heartbeat   │
              │  v20 API │    │    _log      │    │  (every 30s) │
              └──────────┘    └──────┬───────┘    └──────┬───────┘
                                     │                   │
                                     ▼                   ▼
                              ┌──────────────┐   ┌──────────────────┐
                              │ Dashboard UI │   │ OANDA account +  │
                              │ (Next.js)    │   │ conversion rates │
                              └──────────────┘   │ cache            │
                                                 └──────────────────┘
```

**Background processes running every 30 seconds:**
- **Heartbeat** (`src/monitoring/heartbeat.ts`): Fetches OANDA account summary, caches USD/JPY and other conversion rates, checks `bridge_active` flag, updates `bridge_health_log`
- **Trade Monitor** (`src/monitoring/tradeMonitor.ts`): Syncs open trades with OANDA, detects closures, force-closes trades past `max_hold_hours`

---

## 3. Signal Processing Pipeline

Every INSERT on the `signals` table triggers `processSignal()` in `src/core/signalRouter.ts`. The pipeline runs these steps in order and stops at the first failure, logging the decision to `bridge_trade_log`.

```
Signal INSERT
     │
     ▼
[Step 0] Stale Check
     │  age > staleSignalMaxAgeMs (60s) → SKIPPED
     ▼
[Step 1] Validation (signalValidation.ts)
     │  missing engine_id / pair / direction / stop_loss / entry_zone → BLOCKED
     │  TP resolved: target_1 → take_profit → self-calculated fallback
     ▼
[Step 2] Latency Check
     │  processing latency > maxLatencyMs (500ms) → SKIPPED
     ▼
[Step 3] Engine Active Check
     │  engine not registered or is_active=false → BLOCKED
     ▼
[Step 4] Circuit Breaker
     │  kill_switch ON → BLOCKED
     │  drawdown from peak ≥ circuitBreakerDrawdownPct (10%) → BLOCKED
     │  consecutive losses ≥ maxConsecutiveLosses (5) + cooldown active → BLOCKED
     ▼
[Step 5] Dedup + Conflict Resolution
     │  same pair+direction within deduplicationWindowMs (30s) → DEDUPLICATED
     │  open opposite position on same instrument → BLOCKED
     ▼
[Step 6] Risk Checks (riskManager.ts)
     │  confluence score < engine threshold → BLOCKED
     │  engine daily trades ≥ engine.max_daily_trades → BLOCKED
     │  global trades today ≥ 24 → BLOCKED
     │  open positions on same pair ≥ maxPerPairPositions (2) → BLOCKED
     │  same-currency correlation cap exceeded → BLOCKED
     │  no cached OANDA account summary → BLOCKED
     │  forex market closed (weekend) → BLOCKED
     ▼
[Step 7] Position Sizing + OANDA Execution
     │  calculate units (positionSizer.ts)
     │  placeMarketOrder (SL + TP) → OANDA
     │  OANDA orderCancelTransaction → BLOCKED (e.g. "Target price already reached")
     └► INSERT bridge_trade_log (EXECUTED)
```

**Decision types logged to `bridge_trade_log`:**

| Decision | Meaning |
|---|---|
| `EXECUTED` | Order placed and filled on OANDA |
| `BLOCKED` | Failed a pipeline check or OANDA rejected |
| `SKIPPED` | Signal too stale or processing too slow |
| `DEDUPLICATED` | Duplicate of a recently processed signal |

---

## 4. Engine Configuration

Seeded via `migrations/003_seed_engines_links.sql`. Current live values (may differ if updated directly in Supabase):

| Engine | Weight | Exec Threshold | Max Daily Trades | Max Hold | Status |
|---|---|---|---|---|---|
| alpha | 0.33 | 56 | 8 | 4h | Active |
| charlie | 0.33 | 48 | 10 | 4h | Active |
| delta | 0.34 | 58 | 6 | 4h | Active |
| bravo | 0.00 | 50 | 0 | 12h | Inactive |

**Field definitions:**
- `weight`: Fraction of equity allocated to this engine's trades (0.33 = 33%)
- `execution_threshold`: Minimum confluence score for a signal to pass Step 6
- `max_daily_trades`: Maximum trades this engine can execute per UTC day (resets midnight UTC)
- `max_hold_hours`: Bridge force-closes any open trade from this engine after this many hours

**Important:** `weight` values sum to ~1.0 across active engines (0.33 + 0.33 + 0.34 = 1.00), meaning in a worst-case simultaneous fire of all three engines, total capital at risk = `equity × 1.00 × riskPct`.

---

## 5. Position Sizing

**Source:** `src/core/positionSizer.ts`

### Formula

```
effectiveRisk = riskPct × confluenceScale
effectiveRisk = min(effectiveRisk, 0.03)          ← hard cap

riskAmount    = equity × engineWeight × effectiveRisk
pipDist       = slPipsOverride ?? abs(entry - stopLoss) × pipMultiplier
pipValueUSD   = quoteCurrencyConversion(instrument, cachedRate)

units         = floor(max(1, riskAmount / (pipDist × pipValueUSD)))
```

### Confluence Scaling

| Score range | Scaling factor |
|---|---|
| score ≥ 85 | × 1.15 (conviction boost) |
| 75 ≤ score < 85 | × 1.00 (neutral) |
| score < 75 | × 0.85 (caution reduction) |

**Graduated risk reduction:** After 3 consecutive losses, `effectiveRisk × 0.50` until a win resets the counter.

### Pip Value Conversion (USD)

All pip values are converted to USD before the formula runs. Conversion rates are fetched every 30s by the heartbeat and cached:

| Quote currency | Pairs | Pip size | USD conversion |
|---|---|---|---|
| USD | EUR_USD, GBP_USD, AUD_USD, NZD_USD, XAU_USD | 0.0001 | Direct (no conversion) |
| JPY | EUR_JPY, GBP_JPY, AUD_JPY, USD_JPY | 0.01 | ÷ USD_JPY rate |
| CAD | USD_CAD | 0.0001 | ÷ USD_CAD rate |
| CHF | USD_CHF | 0.0001 | ÷ USD_CHF rate |
| GBP | EUR_GBP | 0.0001 | × GBP_USD rate |
| AUD | EUR_AUD, GBP_AUD | 0.0001 | × AUD_USD rate |

Rates cached: `USD_JPY`, `USD_CAD`, `USD_CHF`, `GBP_USD`, `AUD_USD`  
Fallback rates (used if heartbeat hasn't run yet): JPY=150, CAD=1.40, CHF=0.88, GBP=1.27, AUD=0.63

### Current Risk Settings (as of March 2026)

| Parameter | Value | Config key |
|---|---|---|
| `risk_per_trade_pct` | **0.030** (3%) | `bridge_config` |
| Hard cap in code | **0.03** | `positionSizer.ts` line 61 |
| Expected risk per trade (score < 75) | ~$836 on $99k account | Derived |

### SL Pips Source

The position sizer uses `stop_loss_pips` from the engine signal when available (passed as `slPipsOverride`). If absent, it calculates from `abs(entryZoneMid - stopLoss)`. The engine's `stop_loss_pips` is always preferred as it is computed from the engine's live analysis.

---

## 6. TP and SL Execution

**Source:** `src/core/signalValidation.ts` + `src/core/signalRouter.ts`

### Take Profit

Priority chain when resolving the TP price to send to OANDA:

1. `payload.target_1` — engine's primary target (preferred, computed from live analysis)
2. `payload.take_profit` — direct TP field if present in signal
3. Self-calculated fallback: `entryMid ± slDist × defaultRiskReward`

Using `target_1` directly ensures the TP is always the engine's intended analytical target. If the market has already moved past `target_1` before the Bridge executes, OANDA returns `TAKE_PROFIT_ON_FILL_LOSS` and the Bridge logs `"Target price already reached by market before execution"`.

### Stop Loss

Always taken directly from `payload.stop_loss` (engine signal). Never modified by the Bridge.

### Price Precision

| Instrument type | Decimal places | Example |
|---|---|---|
| JPY pairs | 3dp | 183.740 |
| All other pairs | 5dp | 1.34294 |

OANDA rejects orders with `TAKE_PROFIT_ON_FILL_PRICE_PRECISION_EXCEEDED` if more decimal places are sent for JPY pairs.

---

## 7. Trade Monitoring and Exit

**Source:** `src/monitoring/tradeMonitor.ts`  
**Interval:** Every 30 seconds (`tradeMonitorIntervalMs`)

### What it does each cycle

1. Fetches all open trades from OANDA (`getOpenTrades()`)
2. Queries all `status = 'open'` rows in `bridge_trade_log`
3. For each open log row:

**Trade no longer in OANDA (TP or SL hit):**
```
getClosedTradeDetails(tradeId, openTime)
  → UPDATE bridge_trade_log SET
      status = 'closed',
      exit_price, pnl_dollars, result (win/loss/breakeven),
      closed_at, duration_minutes
```

**Trade still open but age ≥ max_hold_hours:**
```
closeTrade(tradeId) via OANDA API
  → UPDATE bridge_trade_log SET
      status = 'closed', close_reason = 'max_hold',
      exit_price, pnl_dollars, result,
      closed_at, duration_minutes
```

### Exit mechanisms summary

| Mechanism | Triggered by | Note |
|---|---|---|
| Take Profit | OANDA (TP order attached at entry) | Bridge detects via monitor |
| Stop Loss | OANDA (SL order attached at entry) | Bridge detects via monitor |
| Max Hold | Bridge force-close | `close_reason = 'max_hold'` |

---

## 8. Bridge Config Reference

All values loaded from Supabase `bridge_config` table at startup. The heartbeat checks `bridge_active` every 30s and exits if set to false.

| Config key | Default | Current | Description |
|---|---|---|---|
| `risk_per_trade_pct` | 0.02 | **0.030** | Base risk fraction per trade |
| `max_total_exposure_pct` | 0.06 | — | Max total open exposure |
| `max_per_pair_positions` | 2 | — | Max open positions per pair |
| `max_correlated_exposure` | 2 | — | Max same-currency directional positions |
| `daily_loss_limit_pct` | 0.05 | — | Daily loss limit (5%) |
| `max_consecutive_losses` | 5 | — | Losses before circuit breaker cooldown |
| `cooldown_after_losses_minutes` | 240 | — | Cooldown duration after consecutive losses |
| `graduated_response_threshold` | 3 | — | Losses before 50% size reduction |
| `circuit_breaker_drawdown_pct` | 0.10 | — | Drawdown % from peak before circuit breaks |
| `deduplication_window_ms` | 30000 | — | Window to reject duplicate signals (ms) |
| `max_latency_ms` | 500 | — | Max pipeline latency before SKIPPED |
| `default_risk_reward` | 1.5 | — | Fallback R:R for self-calculated TP |
| `min_risk_reward_ratio` | 0.5 | — | Minimum acceptable R:R |
| `max_order_timeout_ms` | 10000 | — | OANDA order placement timeout |
| `stale_signal_max_age_ms` | 60000 | — | Max signal age before SKIPPED (60s) |
| `trade_monitor_interval_ms` | 30000 | — | Trade monitor polling interval |
| `weekend_close_buffer_minutes` | 30 | — | Buffer before Friday 22:00 UTC close |
| `heartbeat_interval_ms` | 30000 | — | Heartbeat polling interval |
| `kill_switch` | false | — | Emergency halt — blocks all new trades |
| `bridge_active` | true | — | Master on/off switch |
| `log_all_decisions` | true | — | Log BLOCKED/SKIPPED to bridge_trade_log |
| `news_blackout_enabled` | true | — | Reserved for future news filter |
| `trailing_stop_enabled` | false | — | Not yet implemented |
| `partial_tp_enabled` | false | — | Not yet implemented |

---

## 9. Database Tables

All tables live in the same Supabase project as the engines. The Bridge has read access to `signals` and `signal_outcomes`, and write access only to `bridge_*` tables.

### `signals` (engine-owned, Bridge read-only)

Key fields consumed by the Bridge:

| Field | Type | Used for |
|---|---|---|
| `id` | UUID | Signal reference |
| `engine_id` | TEXT | Engine lookup |
| `pair` | TEXT | Instrument (e.g. `GBPUSD`) |
| `direction` | TEXT | `long` / `short` |
| `confluence_score` | NUMERIC | Risk check threshold |
| `entry_zone_low/high` | NUMERIC | Entry price estimate |
| `stop_loss` | NUMERIC | SL price sent to OANDA |
| `target_1` | NUMERIC | TP price (primary) |
| `stop_loss_pips` | NUMERIC | SL distance override for sizer |
| `target_1_pips` | NUMERIC | TP distance reference |
| `created_at` | TIMESTAMPTZ | Stale check anchor |

### `bridge_trade_log` (Bridge write)

Every signal processed by the Bridge gets one row. Key fields:

| Field | Description |
|---|---|
| `signal_id` | FK to `signals.id` |
| `decision` | `EXECUTED / BLOCKED / SKIPPED / DEDUPLICATED` |
| `block_reason` | Human-readable reason for non-execution |
| `oanda_trade_id` | OANDA trade ticket number |
| `fill_price` | Actual OANDA fill price |
| `units` | Actual filled units (negative = SHORT) |
| `stop_loss / take_profit` | Prices sent to OANDA |
| `status` | `pending / open / closed` |
| `exit_price / pnl_dollars` | Populated by tradeMonitor on close |
| `result` | `win / loss / breakeven` |
| `duration_minutes` | Time from signal to close |
| `close_reason` | `null` (TP/SL) or `max_hold` |

### Other Bridge Tables

| Table | Purpose |
|---|---|
| `bridge_engines` | Engine config, weights, thresholds, `trades_today` counter |
| `bridge_config` | Runtime configuration (all keys above) |
| `bridge_brokers` | OANDA connection status, last heartbeat |
| `bridge_health_log` | 30s heartbeat records (OANDA ok, Supabase ok) |
| `bridge_alert_log` | Webhook/alert history |
| `bridge_daily_snapshot` | Reserved for daily P&L snapshots |
| `bridge_news_events` | Reserved for news blackout events |

### Migrations (run order)

```
000_complete_bridge_schema_and_seed.sql  ← single-file full setup (recommended)
  OR run in order:
  001a → 001b → 001c → 001d → 002 → 003
004_dashboard_rls.sql                    ← dashboard read access
005_bridge_trade_log_duration_minutes.sql ← adds duration_minutes column
```

---

## 10. Environment Variables

Set in Railway dashboard (never in code or committed files).

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `OANDA_API_TOKEN` | Yes | OANDA v20 API token |
| `OANDA_ACCOUNT_ID` | Yes | OANDA account ID (e.g. `101-001-XXXXXXX-001`) |
| `OANDA_ENVIRONMENT` | Yes | `practice` or `live` |
| `SIGNAL_TABLE` | No | Defaults to `signals` |
| `LOG_LEVEL` | No | `info` / `warn` / `error` (default `info`) |
| `TELEGRAM_BOT_TOKEN` | No | Bot token for Telegram notifications (planned) |
| `TELEGRAM_CHAT_ID` | No | Chat ID for Telegram notifications (planned) |
| `ALERT_WEBHOOK_URL` | No | Generic webhook for health alerts |

---

## 11. Supported Instruments

Defined in `src/utils/pairs.ts`. Any instrument matching `^[A-Z]{3}_[A-Z]{3}$` is accepted; the following are explicitly known:

```
EUR_USD  GBP_USD  AUD_USD  NZD_USD  USD_JPY  USD_CHF  USD_CAD
EUR_JPY  GBP_JPY  AUD_JPY  EUR_GBP  EUR_AUD  GBP_AUD  XAU_USD
```

Engine signal pairs use no underscore (e.g. `EURUSD`) — the Bridge normalises these to OANDA format (`EUR_USD`) automatically via `toOandaInstrument()`.

---

## 12. Known Bug Fixes Changelog

| Date | Commit | Fix |
|---|---|---|
| Mar 2026 | `5ec1978` | Fill and close details were missing from `bridge_trade_log`. Added `fill_price`, `oanda_trade_id`, `exit_price`, `pnl_dollars`, `result`, `duration_minutes` tracking. |
| Mar 2026 | `467a3b1` | **TP anchor bug**: Bridge was self-calculating TP from stale entry zone midpoint instead of using engine's `target_1`. Fixed to use `target_1` → `take_profit` → fallback. |
| Mar 2026 | `467a3b1` | **JPY pip value bug**: `getPipValue` returned `0.01` (JPY) instead of `0.01 ÷ USD_JPY_rate` (USD), causing all JPY pair positions to be ~150× too small. Fixed with live conversion rate cache. |
| Mar 2026 | `467a3b1` | **Non-USD pip value bug**: USD_CAD (~40% undersized), USD_CHF (~12%), EUR_GBP (~22%), EUR_AUD/GBP_AUD (~37% oversized). All fixed with correct quote-currency conversion. |
| Mar 2026 | `467a3b1` | Added `stop_loss_pips` and `target_1_pips` from engine signal to `SignalInsertPayload`. Bridge now uses engine's pre-calculated pip distances for position sizing. |
| Mar 2026 | `467a3b1` | Heartbeat now caches `USD_JPY`, `USD_CAD`, `USD_CHF`, `GBP_USD`, `AUD_USD` every 30s via `getCachedConversionRates()`. |
| Mar 2026 | `d6993bf` | **JPY price precision bug**: `toFixed(5)` sent 5dp prices for JPY pairs (e.g. `183.34475`). OANDA only allows 3dp. Fixed: JPY → `toFixed(3)`, others → `toFixed(5)`. |
| Mar 2026 | `762d76b` | **Risk multiplier update**: `risk_per_trade_pct` increased from `0.017` to `0.030` in `bridge_config`. Hard cap in `positionSizer.ts` raised from `0.02` to `0.03` to allow full effect. |

---

## 13. Current Technical Status

| Component | File | Status | Notes |
|---|---|---|---|
| Realtime signal capture | `src/connectors/supabase.ts` | Working | Supabase Realtime on `signals` table |
| Signal validation | `src/core/signalValidation.ts` | Working | Uses engine's `target_1` for TP |
| Risk pipeline | `src/core/signalRouter.ts` | Working | 7-step pipeline |
| Position sizer — USD pairs | `src/core/positionSizer.ts` | Working | Correct since initial build |
| Position sizer — JPY pairs | `src/core/positionSizer.ts` | Working | Fixed March 2026 |
| Position sizer — CAD/CHF/GBP/AUD | `src/core/positionSizer.ts` | Working | Fixed March 2026 |
| Conversion rate cache | `src/monitoring/heartbeat.ts` | Working | Updated every 30s |
| TP precision (JPY 3dp) | `src/core/signalRouter.ts` | Working | Fixed March 2026 |
| Fill/close tracking | `src/core/signalRouter.ts` + `tradeMonitor.ts` | Working | `fill_price`, `exit_price`, `pnl_dollars`, `result` |
| Trade monitor | `src/monitoring/tradeMonitor.ts` | Working | 30s interval, max-hold enforce |
| Heartbeat | `src/monitoring/heartbeat.ts` | Working | 30s interval |
| Circuit breaker | `src/core/circuitBreaker.ts` | Working | In-memory state |
| Deduplication | `src/core/conflictResolver.ts` | Working | In-memory, 30s window |
| Correlation check | `src/core/correlationChecker.ts` | Working | Same-currency exposure |
| Startup reconciliation | `src/startupReconciliation.ts` | Working | Re-adopts open OANDA trades on restart |
| Midnight reset | `src/index.ts` | Working | Resets `trades_today` at 00:00 UTC |
| Dashboard UI | `dashboard/` | Working | Next.js, polls `bridge_trade_log` |
| Telegram notifications | — | Planned | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` env vars reserved |
| Shared dedup across instances | — | Not implemented | Mitigated: run single Railway instance only |
| Trailing stop | — | Not implemented | `trailing_stop_enabled` config key reserved |
| Partial TP | — | Not implemented | `partial_tp_enabled` config key reserved |
| News blackout | — | Not implemented | `news_blackout_enabled` config key reserved |

---

## 14. Deployment Guide

### Repository

```
GitHub:   https://github.com/KitchAIv1/signalforge-bridge
Branches: master (development), main (production/Railway)
```

### Deploy to Railway

```bash
# Make code changes, then:
git add .
git commit -m "description"
git push origin master          # push to GitHub master
git push origin master:main     # push master → main to trigger Railway deploy
```

Railway watches the `main` branch and auto-deploys on every push.

### Local Development

```bash
npm install
cp .env.example .env            # fill in all env vars
npm run dev                     # TypeScript watch mode
```

**Critical:** Never run `npm run dev` locally while Railway Bridge is also running. Both will receive the same Realtime events and create duplicate OANDA trades.

### Test OANDA Connection

```bash
npm run test:connection          # prints balance, EUR_USD price, open trades
```

### Simulate a Signal

```bash
npx tsx src/test/simulateSignal.ts   # inserts a test signal to trigger the pipeline
```

### Build for Production

```bash
npm run build    # TypeScript → dist/
npm start        # runs dist/index.js
```

### Railway Configuration (`railway.toml`)

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5
```

---

*This document reflects the Bridge state as of the March 2026 update session. Update the changelog and status table whenever new fixes or features are deployed.*
