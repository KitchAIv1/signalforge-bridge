# AMD Intelligence System — Complete Reference
**SignalForge / Veredix | v2.5.0 | Updated: 2026-06-01**
**Status: Phase 4 Live — Forward Testing Active**

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-06-01 | v2.5.0 | `decision_auto_direction` snapshot (migration 030), contamination discovery, D1 bar timing fix |
| 2026-05-31 | v2.4.0 | Added ASIAN_CLOSE_FILTER gate (§5.7), Scalper engine integration (§5.8), migrations 027/028 table refs |
| 2026-05-27 | v2.3.0 | Phase 4 live reference baseline |

---

## 1. System Overview

The AMD (Accumulation-Manipulation-Distribution)
framework describes how institutional players
structure AUDUSD each trading day in three phases:

- **ACCUMULATION (00:00–08:00 UTC):** Institutions
  quietly build positions. Price coils in a tight
  range with low volatility.
- **MANIPULATION / Judas Swing (08:00–10:00 UTC):**
  A false move to trap retail traders. Price spikes
  in one direction triggering stop losses.
- **DISTRIBUTION (10:00–16:00 UTC):** The real
  institutional move begins — either reversing the
  Judas (TEXTBOOK) or continuing it (COMPRESSION).

The system runs three live trading/intelligence paths daily:

1. **AmdDetectorService** — fires at 10:31 UTC,
   classifies the day, sets omega_direction
2. **AmdDistributionEngine** — fires every 5
   minutes, places one trade per day at the
   tag-specific entry hour
3. **ScalperEngine** — price-ratchet pullback on
   AGREE+NEUTRAL days (see
   [ENGINE_Scalper_Reference_v1_0_0_May2026.md](./ENGINE_Scalper_Reference_v1_0_0_May2026.md))

---

## 2. AMD Tags — Complete Reference

### 2.1 Tag Classification Logic

Tags are assigned by `resolveAmdTag()` in
`src/services/amdDetector/amdFeatures.ts`
using H1 candles fetched 00:00–10:30 UTC.

| Tag | Conditions | Live Detectable? |
|-----|-----------|-----------------|
| AMD_TEXTBOOK | flat Asian + judas_pips ≥ 8 + reversal_confirmed=true | ❌ No — needs distribution |
| AMD_COMPRESSION_BREAKOUT | flat Asian + judas_pips ≥ 8 + compression_breakout=true | ❌ No — needs distribution |
| AMD_FAILED | flat Asian + judas fired + distribution unknown | ✅ Yes — assigned at 10:31 UTC for all flat+Judas days |
| AMD_SHIFTED | Asian range 35–50 pips OR non-flat Asian < 35 pips | ✅ Yes — pure Asian data |
| AMD_NONE | Asian range ≥ 50 pips | ✅ Yes — pure Asian data |
| INSUFFICIENT_DATA | < 4 Asian H1 candles | ✅ Yes |

**Critical:** TEXTBOOK and COMPRESSION_BREAKOUT
require distribution data (H10–H13) which does
not exist at 10:31 UTC. In live, all flat Asian
+ Judas days are tagged AMD_FAILED. The
amd_outcome_tag column (written at 16:30 UTC)
records the actual full-day classification.

### 2.2 Asian Session Detection
- Hours: 0–7 UTC inclusive (8 H1 candles)
- Range: wick-to-wick high/low in pips
- Flat detection (dual criterion):
  - `netToRangeRatio <= 0.5` (net move / range)
  - OR `oscillationRatio >= 0.3` (opposite candles)
- Minimum 4 candles required

### 2.3 Judas Detection
- Hours: 8–9 UTC (London open)
- UP: upMove > downMove AND upMove > 0.0003 (3 pips)
- DOWN: downMove > upMove AND downMove > 0.0003
- FLAT: neither condition met
- judas_pips threshold for TEXTBOOK eligibility: ≥ 8

### 2.4 D1 Bias Windows
- **5-candle window:** last 5 D1 candles,
  threshold ≥ 3 → TRENDING_UP/DOWN, else RANGING
- **7-candle window:** last 7 D1 candles,
  threshold ≥ 4 → TRENDING_UP/DOWN, else RANGING
  Used by AMD_SHIFTED only
- Lookback: 21 calendar days fetched, last 5 or 7 used

**D1 bar timing at 10:31 UTC (2026-06-01 discovery):** OANDA D1 fetch through `tradeDateT10:30Z` returns the **prior session's evening bar** as the last row. That bar is **incomplete at live 10:31** (FX daily bar closes ~21:00 UTC). Including it flips D1 vote counts and can flip `auto_direction`.

| Context | Handling |
|---------|----------|
| Live detector at 10:31 | [VERIFY] May still include incomplete last D1 bar — `decision_auto_direction` freeze preserves first computed value |
| Backfill / reconstruction | `filterD1CandlesAt1031()` drops last D1 bar: `d1Raw.slice(0, -1)` (`scripts/decisionDirectionBackfill/filterD1At1031.ts`) |
| Doc prior claim | ~~"today's incomplete D1 excluded correctly"~~ — **incorrect** for live fetch; corrected 2026-06-01 |

Example (2026-06-01): with last bar → 2b/3br TRENDING_DOWN → `short`; after drop → 3b/2br TRENDING_UP → `long` (matches live 10:31 observation).

---

## 3. Detection Service — AmdDetectorService.ts

### 3.1 Schedule
- **Cron:** 10:31 UTC daily
- **Startup:** runs if bridge restarts after 10:31 UTC
- **Outcome cron:** 16:30 UTC daily

### 3.2 What Runs at 10:31 UTC
1. Fetch H1 candles 00:00–10:30 UTC
2. `computeDateFeatures()` → AMD tag
3. Fetch D1 candles → 5-candle + 7-candle bias
4. Fetch M5 candles 10:00–10:30 UTC → M5 signal
5. `computeAutoDirectionSnapshot()` → direction
6. Upsert to `amd_state` via `persistAmdInsightRow()` — freezes `decision_auto_direction` on first write
7. `applyAutoDirectionToBridgeConfig()` → writes
   `bridge_config.omega_direction` if mode=auto
8. Send Telegram notification

### 3.3 What Runs at 16:30 UTC
1. Fetch H1 candles 00:00–16:30 UTC
2. `computeDateFeatures()` on full day
3. Write `amd_outcome_tag`, `reversal_confirmed_outcome`,
   `compression_breakout_outcome`,
   `outcome_evaluated_at` to today's `amd_state` row
4. Does NOT overwrite any live detection columns
5. Sets `detection_locked = false` — **unlocks row for detection reruns** (see §3.6)

### 3.4 M5 Signal Computation
- Window: 10:00–10:30 UTC (6 M5 candles)
- Only computed when judas_direction is UP or DOWN
- `netPips` = sum of (close-open) for first 3 candles × 10000
- `m5_first_candle_direction`: doji if body < 0.0002
- `m5_vs_judas_direction`:
  - netPips > 1 = bullish; < -1 = bearish; else neutral
  - UP Judas + bearish net = AGAINST_JUDAS
  - UP Judas + bullish net = WITH_JUDAS
  - DOWN Judas: inverted
- Stored in `amd_state.m5_vs_judas_direction`

### 3.5 Decision snapshot freeze — `persistAmdInsightRow()` (2026-06-01)

Migration `030_amd_decision_snapshot.sql` (commit `4877c56`).

Source: `src/services/amdDetector/amdDecisionSnapshot.ts`, called from `persistAmdInsightRow()` in `AmdDetectorService.ts`.

```typescript
// resolveDecisionSnapshotFields — first write wins
decision_auto_direction: existingSnapshot?.decision_auto_direction ?? autoDir.auto_direction
decision_evaluated_at:   existingSnapshot?.decision_evaluated_at ?? evaluatedAtISO
```

- **`auto_direction`** — updated on every full detection upsert (mutable).
- **`decision_auto_direction`** — written once per day on first detection; preserved across reruns.

### 3.6 `auto_direction` overwrite chain (contamination)

Observed on 2026-06-01; scope audit in [DISCOVERY_AutoDirection_Contamination_June2026.md](./DISCOVERY_AutoDirection_Contamination_June2026.md).

```
10:31 UTC  runAmdDetection()
           → auto_direction set, decision_auto_direction frozen, detection_locked=true

16:30 UTC  runAmdOutcomeDetection() [AMD_FAILED/TEXTBOOK/COMPRESSION only]
           → amd_outcome_tag written
           → detection_locked=false  ← unlocks row

21:xx UTC  bridge restart → runAmdDetection() (startup: after 10:31)
           → full upsert with H1 through current hour + complete D1
           → auto_direction REWRITTEN (may flip direction)
           → evaluated_at updated to rerun timestamp
           → decision_auto_direction UNCHANGED (post-4877c56)
```

**285/287** historical rows show `evaluated_at` outside 10:31–10:35 UTC. **101/287** differ between stored `auto_direction` and backfilled `decision_auto_direction`.

### ⚠️ WARNING — backtesting direction

**Never use `amd_state.auto_direction` for historical backtests or gate classification.**

Always use **`decision_auto_direction`** (faithful 10:31 snapshot). Scripts: `scripts/disagreeCleanBacktest.ts`, `scripts/decisionDirectionBackfill.ts`.

---

## 4. Direction Logic — computeAutoDirectionSnapshot()

File: `src/services/amdDetector/amdAutoDirection.ts`

### 4.1 AMD_TEXTBOOK
- Direction: Judas inversion (UP→short, DOWN→long)
- Confidence + multiplier based on D1 alignment:
  - ALIGNED + strong (≥4/5): high, 2.5×
  - ALIGNED + weak (3/5): medium, 1.5×
  - CONFLICTED: low, 0.5×
- reversal_confirmed=false modifier: 0.5× multiplier;
  if already low confidence → neutral

### 4.2 AMD_COMPRESSION_BREAKOUT
- Direction: Judas continuation (UP→long, DOWN→short)
- Confidence: medium, 1.5× always
- Not detectable in live at 10:31 UTC

### 4.3 AMD_FAILED (two-layer priority)

**Layer 1 — M5 signal (RANGING D1 only):**
Applies when: judasPips ≥ 8 AND m5VsJudas not null
AND (layer4D1Bias = RANGING OR null)

| M5 Signal | Direction | Confidence | Multiplier |
|-----------|-----------|------------|------------|
| WITH_JUDAS | Judas direction | medium | 1.0× |
| AGAINST_JUDAS | neutral | low | 1.0× |
| NEUTRAL | neutral | low | 1.0× |

Rationale: D1 RANGING = no macro conviction.
M5 WITH_JUDAS = 66.7% accuracy (n=39).
D1 TRENDING overrides M5 — backtest showed
D1 direction (+7.0p, 6.9% SL) outperforms
M5 WITH_JUDAS (+0.6p, 20% SL) on TRENDING days.

**Layer 2 — D1 bias (when D1 is TRENDING):**
| D1 Bias | Alignment | Direction | Confidence | Multiplier |
|---------|-----------|-----------|------------|------------|
| TRENDING | ALIGNED + strong ≥4 | D1 direction | medium | 1.75× |
| TRENDING | ALIGNED + weak 3/5 | D1 direction | low | 1.0× |
| TRENDING | CONFLICTED | D1 direction | low | 0.25× |
| RANGING | Any | neutral | low | 1.0× |

### 4.4 AMD_SHIFTED
- Uses 7-candle D1 window (threshold ≥4/7)
- Direction from 7-candle D1 bias
- strongConviction = 5+ of 7 candles same direction
- Multiplier: ALIGNED strong 1.5×, ALIGNED weak 1.0×,
  CONFLICTED strong 0.75×, CONFLICTED weak 0.5×

### 4.5 AMD_NONE
Three tiers based on D1 dominant vote count:
- **TRENDING_WEAK (dominant=3):** Judas inversion
  outperforms D1 (60% vs 56%, n=25 backtest).
  Direction = Judas inversion.
  Multiplier: ALIGNED 0.75×, CONFLICTED 0.5×
- **TRENDING_STRONG (dominant ≥4):** D1 governs.
  Judas logged for forward testing only.
  Multiplier: ALIGNED 1.0×, CONFLICTED 0.25×
- **RANGING (dominant < 3):** D1 direction if
  available, else neutral. Multiplier 0.25×.

### 4.6 INSUFFICIENT_DATA
- neutral always

---

## 5. Distribution Engine — AmdDistributionEngine.ts

### 5.1 Enable/Disable
- Env var: `AMD_DISTRIBUTION_ENABLED=true`
- Also requires: `bridge_engines.is_active=true`
  for `engine_amd`
- Polls every 5 minutes via cron `*/5 * * * *`

### 5.2 Entry Hours (UTC)
| Tag | Entry Hour | Notes |
|-----|-----------|-------|
| AMD_COMPRESSION_BREAKOUT | 10:31 | Requires AMD confirmed (minUtc ≥ 31) |
| AMD_NONE | 10:31 | Requires AMD confirmed |
| AMD_FAILED | 11:00 | |
| AMD_TEXTBOOK | 12:00 | |
| AMD_SHIFTED | 12:00 | |

### 5.3 Hard Exit Hours (UTC)
Validated by exit strategy simulation (272 days,
M5 bar-by-bar, scripts/amdM5ExitStrategySimulation.ts)

| Tag | Hard Exit | Gate Effect | Decision |
|-----|-----------|-------------|----------|
| AMD_NONE | 11:00 | +67% with gate | Keep — validated |
| AMD_TEXTBOOK | 13:00 | -7% pips, +11pp win rate | Keep — win rate benefit |
| AMD_COMPRESSION_BREAKOUT | 16:00 | -25% without gate | Removed — trail runs free |
| AMD_FAILED | 16:00 | -90% without gate | Removed — large D1 moves extend past H12 |
| AMD_SHIFTED | 16:00 | -55% without gate | Removed — trail runs free |

Hard exit at 16:00 = safety net only (no new
entries after this hour via isEntryWindowOpen).

### 5.4 Exit Strategy Per Tag
| Tag | Exit Strategy | Time Gate | Trail |
|-----|--------------|-----------|-------|
| AMD_NONE | S1 | H11 UTC | 2.5 pip |
| AMD_TEXTBOOK | S0 | None (timeGateHour=null) | 2.5 pip |
| AMD_COMPRESSION_BREAKOUT | S0 | None | 2.5 pip |
| AMD_FAILED | S0 | None | 2.5 pip |
| AMD_SHIFTED | S0 | None | 2.5 pip |

S1 = pip trail + time gate when timeGateHour set.
S0 = pip trail only + OANDA hard SL.
Time gate requires BOTH exitStrategy=S1 AND
timeGateHour != null (processOpenState line 231).

### 5.5 Position Parameters
- Hard SL: 15 pips fixed on OANDA at fill
- Pip trail distance: 2.5 pips from peak
- Instrument: AUD_USD
- OANDA account: dedicated `AMD_OANDA_ACCOUNT_ID` (default `101-001-38709456-004`)
- Broker ID on log rows: `oanda_amd_demo`
- Engine weight: **1.0** (on dedicated account ≈ 2% effective risk)
- BASELINE_RISK_PCT: 0.02
- One trade per day maximum (hasExecutedToday gate)
- News blackout: ±90 min window checked
- **Single-order only** — AMD_FAILED ratchet retired; all tags use S0 pip trail (AMD_NONE uses S1 time gate)

### 5.6 Execution Gates (all must pass)
1. AMD_DISTRIBUTION_ENABLED = 'true'
2. amd_state row exists for today
3. auto_direction = 'long' or 'short' (not neutral)
4. **ASIAN_CLOSE_FILTER** (when enabled — see §5.7)
5. isEntryWindowOpen = true (within entry/exit hours)
6. amd_state.evaluated_at = today (not stale)
7. hasExecutedToday = false
8. bridge_engines.engine_amd.is_active = true
9. No news blackout

### 5.7 ASIAN_CLOSE_FILTER

**Source of truth:** `bridge_config` key `amd_asian_close_filter_enabled` (default **false** at launch).
Dashboard toggle: Activity → Controls → AMD → 🌏 Filter ON/OFF.

**Deprecated env fallback:** `AMD_ASIAN_CLOSE_FILTER_ENABLED=true` (used only if config row missing).
**Source:** `loadAmdAsianCloseFilterEnabled()` in `src/services/amd/loadAmdAsianCloseFilterEnabled.ts`

When enabled, blocks distribution entry when Asian close bias **disagrees** with `auto_direction`:

| `asian_close_bias_signal` | Behavior |
|---------------------------|----------|
| `NEUTRAL` | Pass — no strong bias, `auto_direction` governs |
| `BULLISH` + `auto_direction=long` | Pass |
| `BEARISH` + `auto_direction=short` | Pass |
| `BULLISH` + `auto_direction=short` | **BLOCK** — `ASIAN_CLOSE_DISAGREE` |
| `BEARISH` + `auto_direction=long` | **BLOCK** — `ASIAN_CLOSE_DISAGREE` |

Block is logged once per day to `bridge_trade_log` with `decision=BLOCKED`.

**Differs from Scalper gate:** Scalper also **arms** on NEUTRAL (same as distribution). Scalper blocks only DISAGREE pairs. Both engines read live `asian_close_bias_signal` — not `amd_outcome_tag`.

### 5.8 Scalper Engine (parallel path)

Separate from distribution — does not share `hasExecutedToday` gate.

| Item | Value |
|------|-------|
| Enable | `SCALPER_ENABLED=true` |
| Init crons | `32/37/42 10 * * 1-5` UTC |
| Hard close | `0 16 * * 1-5` UTC |
| Tables | `scalper_day_state`, `scalper_trades` (migration 027) |
| Direction gate | AGREE + NEUTRAL (since 2026-05-31) |
| Full reference | [ENGINE_Scalper_Reference_v1_0_0_May2026.md](./ENGINE_Scalper_Reference_v1_0_0_May2026.md) |
| Backtest results | [BACKTEST_ScalperValidation_May2026.md](./BACKTEST_ScalperValidation_May2026.md) |

---

## 6. Trail Stop Monitor — amdTrailingStopMonitor.ts

Runs every 30 seconds via setInterval.
Source: `amd_trail_stop_state` table, status='open'

### 6.1 Exit Triggers (checked per cycle)
1. **External close:** trade not in OANDA open list
   → reconcile via getClosedTradeDetails
2. **Time gate (S1 only):** exitStrategy='S1' AND
   timeGateHour not null AND nowUtcHour ≥ timeGateHour
   → close with reason 'time_gate'
3. **Pip trail:** peak moved ≥ trailPips from entry,
   then adverse ≥ (peak - trailPips) from peak
   → close with reason 'pip_trail'
4. **OANDA hard SL:** fired externally on OANDA
   → detected via external close path

### 6.2 Post-Close Actions
- Marks amd_trail_stop_state.status = 'closed'
- Writes to bridge_trade_log: exit_price, pnl_r,
  pnl_dollars, result, close_reason, closed_at
- Captures intra_trade_candles and post_exit_candles

---

## 7. Database Tables

### 7.1 amd_state
One row per trading day per pair.

| Column | Written by | When | Purpose |
|--------|-----------|------|---------|
| trade_date, pair | AmdDetectorService | 10:31 | Primary key |
| asian_range_pips, asian_net_pips, asian_is_flat | AmdDetectorService | 10:31 | Asian session analysis |
| judas_direction, judas_pips, judas_extreme_price | AmdDetectorService | 10:31 | London manipulation |
| reversal_confirmed, compression_breakout | AmdDetectorService | 10:31 | Always null/false in live at 10:31 |
| amd_tag | AmdDetectorService | 10:31 | Live classification |
| layer4_d1_bias, layer4_bullish_count, layer4_bearish_count | AmdDetectorService | 10:31 | 5-candle D1 bias |
| layer4_d1_bias_7, layer4_bullish_count_7, layer4_bearish_count_7 | AmdDetectorService | 10:31 | 7-candle D1 bias |
| daily_bias_alignment | AmdDetectorService | 10:31 | Judas vs D1 alignment |
| auto_direction, auto_direction_confidence, auto_direction_reason | AmdDetectorService | 10:31 | Computed direction signal (**mutable** — may be overwritten on rerun) |
| decision_auto_direction, decision_evaluated_at | AmdDetectorService | 10:31 (first write only) | **Immutable** 10:31 decision snapshot (migration 030) |
| amd_size_multiplier | AmdDetectorService | 10:31 | Position size multiplier |
| m5_first_3_net_pips, m5_vs_judas_direction, m5_first_candle_direction, m5_evaluated_at | AmdDetectorService | 10:31 | M5 early distribution signal |
| amd_outcome_tag, reversal_confirmed_outcome, compression_breakout_outcome, outcome_evaluated_at | Outcome cron | 16:30 | Full-day actual classification |
| window_tag_used, window_from_utc, window_to_utc, window_pip_move, window_direction_confirmed, window_candles, window_evaluated_at | amdM5OutcomeBackfill script | On demand | Tag-specific window outcome for validation |
| amd_tag_manual_override, override_reason, override_set_at | Dashboard | Manual | Manual tag override |
| manual_observation, observation_set_at | Dashboard | Manual | William's notes |
| chart_data, chart_url, chart_generated_at | Dashboard / AmdDetectorService | Various | H1 OHLC for chart rendering |

### 7.2 amd_trail_stop_state
One row per open AMD distribution trade.

| Column | Purpose |
|--------|---------|
| oanda_trade_id | Links to OANDA position |
| direction | long or short |
| fill_price, hard_sl_price | Entry and SL levels |
| trail_pip_distance | 2.5 pips |
| peak_favorable_price | Updated every monitor cycle |
| time_gate_utc_hour | null for S0, 11 for AMD_NONE |
| exit_strategy | S0 or S1 |
| status | open or closed |

### 7.3 amd_m5_distribution_candles
One row per trading day. M5 candles 10:00–16:00 UTC.
275 rows populated (May 2025 – May 2026).
Used by exit strategy simulation scripts and scalper backtests.

### 7.4 asian_m5_candles (migration 028)
One row per trading day. M5 candles 00:00–08:00 UTC.
Populated by `scripts/asianM5BackfetchFull.ts` and daily cron `5 8 * * 1-5`.
See [SERVICE_AsianM5Candles_May2026.md](./SERVICE_AsianM5Candles_May2026.md).

### 7.5 scalper_day_state / scalper_trades (migration 027)
Scalper engine state and trade audit. One day-state row per `(trade_date, pair)`.
See [ENGINE_Scalper_Reference_v1_0_0_May2026.md](./ENGINE_Scalper_Reference_v1_0_0_May2026.md).

---

## 8. Omega Direction Integration

AmdDetectorService writes to
`bridge_config.omega_direction` after detection.
This drives Omega's trade direction for the day.

### 8.1 direction_mode
- `bridge_config.direction_mode = 'auto'` → AMD
  auto_direction writes to omega_direction
- `bridge_config.direction_mode = 'manual'` →
  AMD detection runs but never writes omega_direction

### 8.2 omega_direction_valid_until
- Written by AmdDetectorService after direction set
- Asian session (AMD_SHIFTED): expires at next 08:00 UTC
- AMD distribution window: expires at 14:00 UTC
- neutral auto_direction: expires immediately (now)
- Omega's signalRouter checks this expiry and blocks
  trades if window is expired (OMEGA_WINDOW_EXPIRED)

### 8.3 Asian Direction Service
- Runs at 21:00 UTC daily (Asian session open)
- Only activates on AMD_SHIFTED days
- Uses prior D1 candle direction (not D1 bias votes)
- Sets omega_direction for Asian session
- Closes open Omega positions at 08:00 UTC

---

## 9. Key Research Findings

### 9.1 Exit Strategy Validation
272-day M5 bar-by-bar simulation
(scripts/amdM5ExitStrategySimulation.ts):

| Tag | S0 No Gate | S1 With Gate | Decision |
|-----|-----------|-------------|----------|
| AMD_TEXTBOOK | 5.5p | 5.1p (-7%) | Keep gate (win rate +11pp) |
| AMD_COMPRESSION | 8.8p | 6.7p (-25%) | Remove gate |
| AMD_FAILED | 7.0p (D1) | 0.7p (-90%) | Remove gate |
| AMD_SHIFTED | 4.0p | 1.8p (-55%) | Remove gate |
| AMD_NONE | 1.7p | 2.8p (+67%) | Keep gate |

### 9.2 M5 Signal Accuracy
Backtest on 99 days (86 TEXTBOOK+COMPRESSION
+ 13 genuine FAILED):

| M5 Signal | Correct Tag | n | Accuracy |
|-----------|------------|---|---------|
| WITH_JUDAS | COMPRESSION | 26/39 | 66.7% |
| AGAINST_JUDAS | TEXTBOOK | 16/34 | 47.1% |
| NEUTRAL | No edge | 26 | — |

WITH_JUDAS only used when D1 is RANGING.
On TRENDING D1 days: D1 direction +7.0p avg (6.9% SL)
vs M5 WITH_JUDAS +0.6p avg (20% SL).

### 9.3 AMD Tag Distribution (272 historical days)
| Tag | Days | % |
|-----|------|---|
| AMD_SHIFTED | 99 | 35.1% |
| AMD_COMPRESSION_BREAKOUT | 54 | 19.3% |
| AMD_FAILED | 50 | 17.9% |
| AMD_TEXTBOOK | 38 | 13.6% |
| AMD_NONE | 36 | 12.9% |
| INSUFFICIENT_DATA | 2 | 0.7% |

### 9.4 Window Direction Confirmation Rates
(amd_state.window_direction_confirmed,
 272 historical days)

| Tag | Confirmed | Not Confirmed | Rate |
|-----|-----------|--------------|------|
| AMD_COMPRESSION | 40/53 | 13/53 | 75.5% |
| AMD_TEXTBOOK | 26/38 | 12/38 | 68.4% |
| AMD_SHIFTED | 55/87 | 32/87 | 63.2% |
| AMD_NONE | 18/34 | 16/34 | 52.9% |
| AMD_FAILED | 13/29 | 16/29 | 44.8% |

---

## 10. Scripts Reference

| Script | Purpose | Run Command |
|--------|---------|-------------|
| scripts/amdHistoricalBacktest.ts | Rerun full 272-day AMD classification backtest | npm run amd-historical |
| scripts/amdM5BackfetchFull.ts | Populate amd_m5_distribution_candles (M5 10:00-16:00) | npx tsx scripts/amdM5BackfetchFull.ts |
| scripts/amdM5OutcomeBackfill.ts | Backfill M5 signal, outcome tag, window outcome | npm run amd-backfill (or with --flags) |
| scripts/amdM5ExitStrategySimulation.ts | Exit strategy comparison (S0/S1/S2/S3 + grid) | npx tsx scripts/amdM5ExitStrategySimulation.ts |
| scripts/amdM5TimeGateReversalAnalysis.ts | Reversal depth analysis per tag per pip threshold | npx tsx scripts/amdM5TimeGateReversalAnalysis.ts |
| scripts/amdFailedTimeGateSim.ts | AMD_FAILED direction source comparison (Pass A/B/C) | npx tsx scripts/amdFailedTimeGateSim.ts |
| scripts/amdTextbookCompressionBacktest.ts | TEXTBOOK vs COMPRESSION feature analysis (86 days) | npx tsx scripts/amdTextbookCompressionBacktest.ts |
| scripts/amdFailedContaminationCheck.ts | M5 signal contamination on genuine FAILED days | npx tsx scripts/amdFailedContaminationCheck.ts |
| scripts/amdD1Backfill (in amdHistoricalBacktest.ts) | Backfill 7-candle D1 bias for all historical rows | npm run amd-d1-backfill |

---

## 11. Known Limitations

1. **TEXTBOOK/COMPRESSION not live-detectable at
   10:31 UTC.** Both require distribution data
   (H10–H13). Live tags these as AMD_FAILED.
   amd_outcome_tag at 16:30 records actual result.

2. **M5 signal on genuine FAILED days: 20% SL rate.**
   WITH_JUDAS on RANGING D1 introduces hard SL risk.
   Acceptable given no other directional signal.

3. **reversal_confirmed logic too loose.** One candle
   briefly touching the AMD midpoint passes the check.
   Minimum 5-pip penetration or 2+ candles pending.

4. **AMD_PARTIAL structurally unreachable in live.**
   reversal_confirmed is never null at 10:31 UTC
   because hour-10 H1 candle is always available.

5. **Historical data starts May 2025.** OANDA practice
   account history before that returns empty candles.

6. **D1 RANGING in live = 2/2 vote artifact.**
   When only 4 D1 candles are returned (missing one),
   votes show 2/2 producing RANGING classification.
   This is a data quality issue, not genuine ranging.

7. **`auto_direction` historical contamination (2026-06-01).**
   285/287 rows have post-10:31 `evaluated_at`. Use
   `decision_auto_direction` for all backtests. See
   DISCOVERY_AutoDirection_Contamination_June2026.md.

8. **Forward testing sample still small.**
   AMD engine went live May 2026. Minimum 50 live
   AMD distribution trades needed before drawing
   conclusions about live accuracy.

---

## 12. Environment Variables

### AmdDetectorService (bridge Railway service)
| Variable | Purpose |
|----------|---------|
| SUPABASE_URL | Supabase connection |
| SUPABASE_SERVICE_ROLE_KEY | Bypasses RLS |
| OANDA_API_TOKEN | OANDA authentication |
| OANDA_ENVIRONMENT | practice or live |
| TELEGRAM_BOT_TOKEN | @Veredix_amd_bot alerts |
| TELEGRAM_CHAT_ID | 7367498815 |

### AmdDistributionEngine (bridge Railway service)
| Variable | Purpose |
|----------|---------|
| AMD_DISTRIBUTION_ENABLED | 'true' to enable live trading |
| AMD_OANDA_ACCOUNT_ID | Dedicated OANDA sub-account for engine_amd (e.g. `101-001-38709456-004`) |
| AMD_ASIAN_CLOSE_FILTER_ENABLED | Deprecated — use `bridge_config` `amd_asian_close_filter_enabled` instead |

### ScalperEngine (bridge Railway service)
| Variable | Default | Purpose |
|----------|---------|---------|
| SCALPER_ENABLED | off | 'true' to enable scalper crons |
| SCALPER_PULLBACK_PIPS | 5 | Pullback from 10:00 reference |
| SCALPER_TP_PIPS | 10 | Take profit pips |
| SCALPER_SL_PIPS | 10 | Stop loss pips |
| SCALPER_MAX_RATCHETS | 3 | Max ratchets per day |
| SCALPER_RISK_PCT | 0.01 | Risk fraction per trade |
| SCALPER_PAIR | AUD_USD | Instrument |

See [ENGINE_Scalper_Reference_v1_0_0_May2026.md](./ENGINE_Scalper_Reference_v1_0_0_May2026.md) for full scalper env reference.

---

*AMD System Reference v2.6.0 | SignalForge / Veredix |
Updated 2026-07-08 | Confidential*
