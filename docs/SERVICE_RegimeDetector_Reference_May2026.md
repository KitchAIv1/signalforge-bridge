# Regime Detector Service — Reference

**SignalForge / Veredix | May 2026**
**Migrations:** `011_regime_state.sql`, `012_regime_state_layer7.sql`
**Source:** `src/services/RegimeDetectorService.ts`, `src/services/regimeDetector/`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial service reference |

---

## 1. Purpose

Evaluates **AUD_USD** market regime from D1 and H4 OANDA candles every H4 close. Combines four analytical layers (L4–L7) into a direction/confidence decision and writes a snapshot row to `regime_state`.

**Why it exists:** Omega position sizing uses regime confidence as an advisory multiplier. The bridge reads the latest `regime_state` row at Omega signal execution time and applies `getRegimeSizeMultiplier()` — it does **not** block Omega signals based on regime direction.

---

## 2. Cron Schedule

Registered in `src/index.ts` with `{ timezone: 'UTC' }`:

| Cron string | UTC times | Function |
|-------------|-----------|----------|
| `'5 0,4,8,12,16,20 * * *'` | **00:05, 04:05, 08:05, 12:05, 16:05, 20:05 UTC** (6× daily) | `runRegimeDetection()` |

H4 candles close at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC. Regime runs **5 minutes after** each close.

**Startup:** `runRegimeDetection()` also runs once on bridge boot so `regime_state` is populated immediately.

---

## 3. Layers — L4 Through L7

All layer logic in `src/services/regimeDetector/layerComputation.ts` and `regimeClassifier.ts`.

### Layer 4 — D1 Trend (last 5 prior D1 candles)

Counts bullish (`close > open`) vs bearish (`close < open`) candles before evaluation time.

| Condition | Result |
|-----------|--------|
| `bullishCount >= 3` | `TRENDING_UP` |
| `bearishCount >= 3` | `TRENDING_DOWN` |
| Otherwise | `RANGING` |

If fewer than 5 prior candles: returns `RANGING` with zero counts.

### Layer 5 — H4 Structure (last 6 prior H4 candles)

Compares average of **first 3** closes vs **last 3** closes.

**Threshold:** `THRESHOLD_AUDUSD = 0.0008` (8 pips)

| Condition | Result |
|-----------|--------|
| `avgLast3 - avgFirst3 > 0.0008` | `BULLISH` |
| `avgLast3 - avgFirst3 < -0.0008` | `BEARISH` |
| Otherwise | `NEUTRAL` |

`pipDiff = Math.round(diff * 10000)`.

### Layer 6 — D1 Range Position (last 10 prior D1 candles)

Position of latest close within 10-day high/low range:

```typescript
positionPct = Math.round(((currentPrice - rangeLow) / rangeSize) * 100)
```

If fewer than 10 candles or zero range: `positionPct = 50`.

### Layer 7 — Weekly Open Reality Check

**Active window** (`isWeeklyOpenWindow`):
- Sunday from **21:00 UTC** onward
- Monday before **08:00 UTC**

Compares live OANDA mid price to Friday D1 close.

**Threshold:** `THRESHOLD_PIPS = 8` (`THRESHOLD_PRICE = 8 * 0.0001`)

| Condition | L5 override |
|-----------|-------------|
| `currentPrice - fridayClose <= -8 pips` | `BEARISH` |
| `currentPrice - fridayClose >= +8 pips` | `BULLISH` |
| Within ±8 pips | `null` (no override) |

When override applies, `effectiveL5Result` replaces raw L5 for classification. Raw L5 stored as `layer5_result_raw`.

### Regime Classification (`classifyRegime`)

**Base direction/confidence** (L4 × effective L5):

| L4 | L5 | Direction | Confidence |
|----|-----|-----------|------------|
| TRENDING_UP | BEARISH | LONG | HIGH |
| TRENDING_UP | NEUTRAL | LONG | MEDIUM |
| TRENDING_UP | BULLISH | LONG | LOW |
| TRENDING_DOWN | BULLISH | SHORT | HIGH |
| TRENDING_DOWN | NEUTRAL | SHORT | MEDIUM |
| TRENDING_DOWN | BEARISH | SHORT | LOW |
| RANGING or other | any | PAUSE | PAUSE |

**Choppy extended override** (`isChoppyExtended`):

```typescript
direction !== 'PAUSE' && positionPct > 70 && absPipDiff < 20
```

When true → `direction: PAUSE`, `confidence: PAUSE`, `choppy_extended_override: true`.

---

## 4. Output — `regime_state` Columns Written

Each evaluation **inserts** one row (`RegimeDetectorService.ts`):

| Column | Source |
|--------|--------|
| `pair` | `'AUD_USD'` |
| `evaluated_at` | Evaluation timestamp |
| `regime_direction` | `LONG` / `SHORT` / `PAUSE` |
| `regime_confidence` | `HIGH` / `MEDIUM` / `LOW` / `PAUSE` |
| `choppy_extended_override` | boolean |
| `layer4_result` | L4 result |
| `layer4_bullish_count` | L4 bullish count |
| `layer4_bearish_count` | L4 bearish count |
| `layer5_result` | **Effective** L5 (post-L7 override) |
| `layer5_result_raw` | Raw L5 before L7 |
| `layer5_pip_diff` | L5 pip diff |
| `layer6_position_pct` | L6 position % |
| `layer7_pip_diff` | L7 pip diff or null |
| `layer7_override_active` | Whether L7 changed L5 |

---

## 5. How Engines Use It

| Consumer | Usage |
|----------|-------|
| **Omega** (`signalRouter.ts`) | On Omega signals only: `fetchLatestRegimeState('AUD_USD')` → `getRegimeSizeMultiplier(confidence)` applied to position size. Regime direction is logged but **not** used to block execution. |
| **Dashboard** (`useRegimeState.ts`) | Displays latest regime snapshot. |
| **bridge_trade_log** | Omega executions store `regime_direction`, `regime_confidence`, `regime_evaluated_at`, `regime_size_multiplier`, and layer snapshot columns. |

**Size multipliers** (`RegimeStateService.ts`):

| Confidence | Multiplier |
|------------|------------|
| HIGH | 1.0 |
| MEDIUM | 0.3 |
| LOW | 0.15 |
| PAUSE | 0.10 |

**Other engines:** AMD Distribution, Scalper, and external signal engines do **not** read `regime_state` in bridge code.

---

## 6. Key Tables

### `regime_state`

Created by `011_regime_state.sql`, extended by `012_regime_state_layer7.sql`. One row per evaluation (append-only history). Latest row per pair used at read time.

Indexes: `idx_regime_state_pair_evaluated` on `(pair, evaluated_at DESC)`.

### `regime_log`

**[VERIFY — not defined in repo migrations.]** Supabase query per user spec:

```sql
SELECT COUNT(*) as total_logs,
  MIN(evaluated_at) as earliest,
  MAX(evaluated_at) as latest
FROM regime_log
WHERE pair = 'AUD_USD';
```

**Result:** Query failed — `column regime_log.evaluated_at does not exist`. Table exists with **0 rows** for `AUD_USD`. Use `regime_state` as the authoritative audit table.

### Supabase distribution query (2026-05-31)

```sql
SELECT regime_direction, regime_confidence, COUNT(*) as n
FROM regime_state
WHERE pair = 'AUD_USD'
GROUP BY regime_direction, regime_confidence
ORDER BY n DESC;
```

| regime_direction | regime_confidence | n |
|------------------|-------------------|---|
| PAUSE | PAUSE | 128 |
| SHORT | LOW | 56 |
| SHORT | HIGH | 30 |
| LONG | LOW | 29 |
| LONG | HIGH | 16 |
| SHORT | MEDIUM | 7 |

**Total rows:** 266  
**Earliest `evaluated_at`:** 2026-05-10T19:04:46.486+00:00  
**Latest `evaluated_at`:** 2026-05-31T23:06:07.894+00:00

---

## 7. Failure Modes

| Condition | Behavior |
|-----------|----------|
| D1 candles `< 5` or H4 candles `< 6` | Logs warning, **returns without writing** |
| OANDA fetch failure | Same — insufficient candles, skip write |
| Layer 7 pricing fetch fails | `currentMidPrice ?? 0` — override unlikely, L7 logs no override |
| Supabase insert error | Logs error, returns |
| Missing env vars | Throws at client build (startup would fail on first run) |

No retry logic. Next H4 evaluation (≤4 hours) attempts again.

---

## 8. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Write `regime_state` |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY` | Yes | Service role |
| `OANDA_API_TOKEN` | Yes | Candle + L7 pricing fetch |
| `OANDA_ACCOUNT_ID` | Yes (L7 only) | Pricing endpoint |
| `OANDA_ENVIRONMENT` | No (default `practice`) | API base URL |

**Lookback windows:** D1 = 18 days, H4 = 3 days (`RegimeDetectorService.ts`).
