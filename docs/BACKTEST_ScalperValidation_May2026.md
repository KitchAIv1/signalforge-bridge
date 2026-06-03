# Scalper Backtest Validation — May 2026

**Purpose:** Consolidated reference for all scalper-related backtests. Every performance figure traces to an exact row in `scripts/output/*.csv`. Spread-adjusted figures use `expectancy_net = expectancy_gross - 1.04` from `scalper_net_after_spread_summary.csv`.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-03 | Reference Price Correction section — `fetchTenAmM5Candle` fix + reference comparison backtest |
| 2026-06-01 | Clean Data Re-evaluation section — `decision_auto_direction` cohort (`disagree_clean_grid.csv`) |
| 2026-05-31 | Added agree_status split + net-after-spread from output CSVs |
| 2026-05-31 | Initial validation doc |

---

## 1. Shared Simulation Logic

Production and validation backtests use `scripts/scalperBacktest/simulatePriceRatchetDay.ts`:

| Rule | Value |
|------|-------|
| Reference | 10:00 UTC M5 bar close (`c`) |
| Trigger scan start | 10:05 UTC |
| Trigger scan end | 15:55 UTC (when `triggerScanCutoff='1600'`) |
| Hard close | 16:00 UTC bar close (`c`) |
| Entry price | Limit at trigger level (not candle extreme) |
| Same-bar resolution | SL before TP |
| Pip size | `pips / 10000` |
| Candle source (distribution) | `amd_m5_distribution_candles` |
| Candle source (Asian) | `asian_m5_candles` |
| `amd_outcome_tag` | Not referenced |

Contamination audits (May 2026): 14/14 checks passed on `distributionNoGateBacktest` + `simulatePriceRatchetDay`.

---

## 2. Cohort Definitions

### AGREE cohort (most scalper backtests)

Source: `scripts/scalperBacktest/loadAgreeDirectionalCohort.ts`

```
pair = AUD_USD
auto_direction IN ('long', 'short')
asian_close_bias_signal AGREE:
  BULLISH + long, OR BEARISH + short
trade_date >= 2025-05-01
Must have amd_m5_distribution_candles fetch_status = success
```

**Does not include NEUTRAL days.** Live scalper post-2026-05-31 arms NEUTRAL — see engine doc.

### No-gate cohort A

Source: `scripts/distributionNoGateBacktest/loadCohorts.ts`

```
auto_direction IN ('long', 'short'), no AGREE filter
254 days with distribution candles (CSV row count)
```

### Asian scalper cohorts

Source: `scripts/asianScalperBacktest/loadCohorts.ts`

- **Cohort A:** `asian_direction_log` SET_LONG/SET_SHORT (AMD_SHIFTED direction_set)
- **Cohort B:** All `auto_direction` long/short days, Asian M5 candles

---

## 3. Extended Window Backtest (production config selection)

**Script:** `scripts/scalperExtendedWindowBacktest.ts`
**CSV:** `scripts/output/scalper_extended_window_grid.csv`
**Cohort:** AGREE, 124 days (`scalper_extended_window_grid.csv`)
**Date range:** Cohort loader filters `trade_date >= 2025-05-01` (`loadAgreeDirectionalCohort.ts`); exact end date not stored in grid CSV.

| Run | pullback | window | n_days | total_trades | trades/day | win_pct | net_pips_total | expectancy/trade (gross) | expectancy/trade (net) | days_stopped_by_sl | days_no_trigger |
|-----|----------|--------|--------|--------------|------------|---------|----------------|--------------------------|------------------------|--------------------|-----------------|
| A | 3 | 10:05–16:00 | 124 | 330 | 2.66 | 68.4 | 893.4 | 2.71 | 1.67 | 74 | 15 |
| **B** | **5** | **10:05–16:00** | **124** | **269** | **2.17** | **73.3** | **1054.6** | **3.92** | **2.88** | **55** | **26** |
| C | 5 | 10:05–14:00 | 124 | 205 | 1.65 | 73.5 | 896.8 | 4.37 | 3.33 | 48 | 32 |

Net column source: `scripts/output/scalper_net_after_spread_summary.csv` (`extended_window_run_*`, spread=1.04).

**Run B selected for production:** pullback=5, tp=10, sl=10, max_ratchets=3, window 10:05–16:00.

Run B after-14:00 slice (same CSV): 64 trades fired 14:00–16:00, win_pct_after_1400=72, net_pips_after_1400=157.8.

---

## 4. Price Ratchet Grid Backtest

**Script:** `scripts/scalperPriceRatchetBacktest.ts`
**CSV:** `scripts/output/scalper_price_ratchet_grid.csv`
**Cohort:** AGREE, 124 days
**Note:** Uses default `triggerScanCutoff='1400'` (10:05–14:00 entries), not production 16:00 window.

| pullback | max_ratchets | n_days | total_trades | trades/day | win_pct | net_pips_total | expectancy/trade | days_stopped_by_sl | days_no_trigger |
|----------|--------------|--------|--------------|------------|---------|----------------|------------------|--------------------|-----------------|
| 3 | 2 | 124 | 213 | 1.72 | 63.8 | 522.1 | 2.45 | 67 | 16 |
| 3 | 3 | 124 | 272 | 2.19 | 67.8 | 771.2 | 2.84 | 68 | 16 |
| 5 | 2 | 124 | 171 | 1.38 | 70.3 | 674.1 | 3.94 | 47 | 32 |
| 5 | 3 | 124 | 205 | 1.65 | 73.5 | 896.8 | 4.37 | 48 | 32 |

Production row (pullback=5, max_ratchets=3) with **16:00 window** → see Extended Window Run B above (+1054.6 vs +896.8 with 14:00 cutoff).

---

## 5. Trailing Reference Backtest

**Script:** `scripts/scalperTrailingRefBacktest.ts`
**CSV:** `scripts/output/scalper_trailing_ref_grid.csv`
**Cohort:** AGREE, 124 days

Best expectancy rows (same CSV):

| pullback | tp | sl | total_trades | win_pct | net_pips_total | expectancy/trade |
|----------|----|----|--------------|---------|----------------|------------------|
| 5 | 8 | 10 | 143 | 70.9 | 390 | 2.73 |
| 5 | 10 | 10 | 132 | 65.1 | 380 | 2.88 |

Trailing-ref variant not selected for production (price-ratchet chosen).

---

## 6. Pullback Grid Backtest (single-entry baseline)

**Script:** `scripts/scalperPullbackBacktest.ts`
**CSV:** `scripts/output/scalper_pullback_grid.csv`
**Cohort:** AGREE, 124 days triggered / 16–49 no_trigger per row

Selected rows:

| pullback | tp | sl | triggered | win_pct | net_pips | expectancy/triggered |
|----------|----|----|-----------|---------|----------|----------------------|
| 5 | 10 | 10 | 92 | 64.4 | 260 | 2.83 |
| baseline_1030 | 10 | 10 | 124 | 57.4 | 180 | 1.45 |

---

## 7. Concurrent / Multi-Entry Backtests (rejected variants)

**Concurrent CSV:** `scripts/output/scalper_concurrent_grid.csv`

| variant | pullback | total_trades | trades/day | expectancy/trade | net_pips_total |
|---------|----------|--------------|------------|------------------|----------------|
| A | 5 | 1118 | 9.02 | 3.27 | 3658 |
| B | 5 | 1124 | 9.06 | 3.17 | 3561.3 |

Unlimited concurrent entries — not production logic.

**Multi-pullback CSV:** `scripts/output/scalper_multi_pullback_grid.csv`

All pullback=5 rows show **negative** expectancy (e.g. 1443 trades, -1570 net pips, -1.09/trade) — rejected.

---

## 8. No-Gate Distribution Backtest

**Script:** `scripts/distributionNoGateBacktest.ts`
**CSV:** `scripts/output/distribution_no_gate_grid.csv`
**Config:** pullback=5, tp=10, sl=10, max_ratchets=3, triggerScanCutoff=`1600`
**Cohort:** All directional days (no AGREE filter)

| cohort | n_days | total_trades | trades/day | win_pct | net_pips_total | expectancy/trade | days_stopped_by_sl | days_no_trigger |
|--------|--------|--------------|------------|---------|----------------|------------------|--------------------|-----------------|
| A | 254 | 481 | 1.89 | 70.5 | 1507.9 | 3.13 | 104 | 73 |
| B | 286 | 481 | 1.68 | 70.5 | 1507.9 | 3.13 | 104 | 105 |

**By amd_tag** (`distribution_no_gate_by_tag.csv`, cohort A directional days):

| amd_tag | n_days | win_pct | expectancy/trade | net_pips |
|---------|--------|---------|------------------|----------|
| AMD_COMPRESSION_BREAKOUT | 54 | 83.9 | 5.21 | 411.8 |
| AMD_FAILED | 29 | 77.5 | 4.52 | 262.2 |
| AMD_NONE | 34 | 72.4 | 3.64 | 367.2 |
| AMD_SHIFTED | 99 | 64.5 | 2.05 | 403.6 |
| AMD_TEXTBOOK | 38 | 58.6 | 1.37 | 63.1 |

### AGREE / NEUTRAL / DISAGREE split

**CSV:** `scripts/output/distribution_agree_split.csv`
**Method:** Join `distribution_no_gate_daily.csv` to `amd_state` on `trade_date`; classify by `asian_close_bias_signal` vs `auto_direction`.

| agree_status | n_days | total_trades | total_wins | total_losses | win_pct | net_pips_total | expectancy/trade (gross) | expectancy/trade (net) | days_no_trigger |
|--------------|--------|--------------|------------|--------------|---------|----------------|--------------------------|------------------------|-----------------|
| AGREE | 124 | 269 | 151 | 55 | 73.3 | 1054.6 | 3.92 | 2.88 | 26 |
| NEUTRAL | 44 | 75 | 44 | 14 | 75.9 | 299.3 | 3.99 | 2.95 | 18 |
| DISAGREE | 86 | 137 | 54 | 35 | 60.7 | 154.0 | 1.12 | 0.08 | 29 |
| UNKNOWN | 0 | 0 | 0 | 0 | — | 0.0 | — | — | 0 |

Net column source: `scalper_net_after_spread_summary.csv` (`agree_split_*`, spread=1.04).

**Live operating population (AGREE + NEUTRAL):** 168 days, combined gross +1353.9 net pips (+1054.6 + +299.3 from table above).

**⚠️ Contamination warning (2026-06-01):** This split uses `auto_direction` from `amd_state`, which is suspect on 285/287 historical days. See §14 for clean-cohort re-evaluation using `decision_auto_direction`.

---

## 9. Asian Session Scalper Backtest

**Script:** `scripts/asianScalperBacktest.ts`
**CSV:** `scripts/output/asian_scalper_backtest.csv`
**Config:** pullback=5, tp=10, sl=10, max_ratchets=3, session 00:00–08:00 UTC

| cohort | n_days | total_trades | trades/day | win_pct | net_pips_total | expectancy/trade | days_stopped_by_sl | days_no_trigger |
|--------|--------|--------------|------------|---------|----------------|------------------|--------------------|-----------------|
| A | 2 | 6 | 3 | 83.3 | 40 | 6.67 | 1 | 0 |
| B | 255 | 409 | 1.6 | 61.7 | 674.5 | 1.65 | 113 | 71 |

**Limitation:** Cohort A has only 2 days with matching `asian_direction_log` + candle data — not statistically meaningful.

---

## 10. Legacy Single-Entry Grid

**Script:** `scripts/scalperBacktest.ts`
**CSV:** `scripts/output/scalper_backtest_grid.csv`
**Cohort:** 22 days per grid rows (`n=22` in CSV) — early exploratory cohort, not AGREE 124-day validation set.

Not used for production decisions.

---

## 11. Net After Spread Summary

**CSV:** `scripts/output/scalper_net_after_spread_summary.csv`
**Formula:** `expectancy_net = expectancy_gross - 1.04`

| config | n_days | total_trades | win_pct | net_pips_total | expectancy_gross | expectancy_net |
|--------|--------|--------------|---------|----------------|------------------|----------------|
| extended_window_run_B (production) | 124 | 269 | 73.3 | 1054.6 | 3.92 | 2.88 |
| agree_split_AGREE | 124 | 269 | 73.3 | 1054.6 | 3.92 | 2.88 |
| agree_split_NEUTRAL | 44 | 75 | 75.9 | 299.3 | 3.99 | 2.95 |
| agree_split_DISAGREE | 86 | 137 | 60.7 | 154.0 | 1.12 | 0.08 |
| no_gate_cohort_A | 254 | 481 | 70.5 | 1507.9 | 3.13 | 2.09 |
| asian_scalper_cohort_B | 255 | 409 | 61.7 | 674.5 | 1.65 | 0.61 |

Full table (14 configs) in CSV.

---

## 12. Contamination Checks Performed

| Backtest | Checks | Result |
|----------|--------|--------|
| `distributionNoGateBacktest` | Q1–Q14 audit (May 2026) | 14/14 PASS |
| `simulatePriceRatchetDay` | Referenced by all distribution scalper backtests | SL before TP, no mid-price, 10:00 ref |
| `asianScalperBacktest` | Separate audit (May 2026) | PASS — uses `asian_m5_candles`, 00:00 ref |

---

## 13. Conclusions (from CSV data only)

1. **Production config validated:** Extended Window Run B — 124 days, +1054.6 net pips, +3.92/trade gross, **+2.88/trade net** (`scalper_extended_window_grid.csv` + `scalper_net_after_spread_summary.csv`).
2. **16:00 window matters:** Same pullback=5/max_ratchets=3 with 14:00 cutoff yields +896.8 gross (`scalper_price_ratchet_grid.csv` row 5) vs +1054.6 with 16:00 window.
3. **Multi-trade ratchet fires:** Run B avg 2.17 trades/day; max concurrent observed = 3 (same CSV).
4. **DISAGREE near zero edge:** +0.08/trade net (`distribution_agree_split.csv` DISAGREE row).
5. **NEUTRAL strong bucket:** +2.95/trade net over 44 days — live engine arms NEUTRAL post-2026-05-31.
6. **Asian session:** Cohort B +0.61/trade net over 255 days; Cohort A sample too small (2 days).

7. **Clean re-evaluation (2026-06-01):** AGREE+NEUTRAL combined **+2.32/trade net** on `decision_auto_direction` cohort — ~20% lower than contaminated §8 estimate. DISAGREE net **-0.24/trade** — keep blocked.

8. **Reference price (2026-06-03):** Live init must use 10:00 UTC bar (`fetchTenAmM5Candle`). Pre-fix live behavior matched Config B (−0.27/trade net vs backtest). See §15.

---

## 14. Clean Data Re-evaluation (June 2026)

**Date:** 2026-06-01  
**Script:** `scripts/disagreeCleanBacktest.ts`  
**CSV:** `scripts/output/disagree_clean_grid.csv`  
**Cohort loader:** `scripts/disagreeCleanBacktest/loadCleanCohort.ts` — reads `decision_auto_direction` only (never `auto_direction`).

### 14.1 Why re-run was required

| Finding | Source |
|---------|--------|
| 287 `amd_state` rows since 2025-05-01 | Backfill + contamination audit |
| 285 rows (`99.3%`) have `evaluated_at` outside 10:31–10:35 UTC (`rerun_later`) | Ad-hoc query on `evaluated_at` hour/minute [VERIFY re-run query in repo] |
| 2 rows (`clean_1031`) — only 2026-05-30 and 2026-05-31 | Same audit |
| 101/287 days: reconstructed `decision_auto_direction` ≠ stored `auto_direction` | `scripts/output/decision_direction_backfill_v2.csv` (`changed=true` count) |

Root cause: `auto_direction` is overwritten after 10:31 when the 16:30 outcome cron unlocks `detection_locked` and a later bridge restart reruns full detection. See [DISCOVERY_AutoDirection_Contamination_June2026.md](./DISCOVERY_AutoDirection_Contamination_June2026.md).

**Fix deployed:** Migration 030 — immutable `decision_auto_direction` / `decision_evaluated_at` (commit `4877c56`). Historical values backfilled via `scripts/decisionDirectionBackfill.ts` with H1 hour-10 filter + D1 last-bar drop (`filterD1At1031.ts`, commit `901f19e`).

### 14.2 Simulation config (all clean runs)

| Parameter | Value |
|-----------|-------|
| pullback / tp / sl | 5 / 10 / 10 |
| max_ratchets | 3 |
| window | 10:05–16:00 (`triggerScanCutoff='1600'`) |
| spread adjustment | `expectancy_net = expectancy_gross - 1.04` (same formula as §11) |

### 14.3 Gate counts (278 directional days with `decision_auto_direction`)

From `disagreeCleanBacktest.ts` console output / `loadCleanCohort.ts`:

| Gate | Days |
|------|------|
| AGREE | 117 |
| NEUTRAL | 51 |
| DISAGREE | 110 |
| BLOCKED | 0 |

AGREE + NEUTRAL = **168 qualifying days** (live scalper operating population on clean data).

### 14.4 Clean AGREE / NEUTRAL results

Source: `disagree_clean_grid.csv` Runs A and B:

| Gate | n_days | total_trades | win_pct | net_pips | expectancy/trade (gross) | expectancy/trade (net) |
|------|--------|--------------|---------|----------|--------------------------|------------------------|
| AGREE (Run A) | 117 | 266 | 72.1 | 987.1 | 3.71 | **2.67** |
| NEUTRAL (Run B) | 51 | 96 | 64.3 | 230.4 | 2.40 | **1.36** |
| **Combined** | **168** | **362** | — | **1217.5** | **3.36** | **2.32** |

Combined net/trade: `(987.1 + 230.4) / (266 + 96) - 1.04 = 2.32`.

### 14.5 Clean DISAGREE results

Source: `disagree_clean_grid.csv` Run C (`direction_source=decision_auto_direction`):

| Metric | Value |
|--------|-------|
| n_days | 110 |
| total_trades | 201 |
| win_pct | 57.2 |
| net_pips | 160.5 |
| expectancy/trade (gross) | **0.80** |
| expectancy/trade (net) | **-0.24** |

**Verdict:** DISAGREE remains blocked in live — net edge is negative after 1.04 pip spread. Contaminated split (§8) showed +0.08/trade net on 86 days using `auto_direction`; that figure is not reliable.

Contaminated DISAGREE strategy backtest (`disagree_strategy_grid.csv`, cohort2 Strategy B): +84.5 net pips, +1.36/trade on `auto_direction` — **invalid for decision-time inference**.

### 14.6 Expectancy vs contaminated estimate

| Cohort | Contaminated gross/trade (§8) | Clean gross/trade (§14.4) | Contaminated net/trade | Clean net/trade |
|--------|------------------------------|---------------------------|------------------------|-----------------|
| AGREE + NEUTRAL | 3.94 | 3.36 | 2.90 | 2.32 |

Net expectancy reduction: **~20%** lower on clean data `(2.90 → 2.32)`.

Production config selection (Run B extended window) remains directionally valid but pre-June figures in §3–§8 should be treated as upper-bound estimates until re-run on `decision_auto_direction`.

---

## 15. Reference Price Correction (June 2026)

**Date:** 2026-06-03  
**Script:** `scripts/scalperReferenceComparisonBacktest.ts`  
**CSV:** `scripts/output/reference_comparison_grid.csv`, `scripts/output/reference_comparison_daily.csv`  
**Cohort:** AGREE + NEUTRAL, 168 days, `decision_auto_direction` (§14.3)

### Bug discovered

Live scalper init called `fetchLatestM5Candle()`, which returns the last complete M5 bar at call time (~10:32 UTC) — the **10:25 bar close**, not the **10:00 UTC distribution-open bar** used by all backtests (`simulatePriceRatchetDay.ts` reads `candles[0].c`).

### Gap quantification (282 distribution-candle days)

| Metric | Value |
|--------|-------|
| Average gap (10:00 vs 10:25 close) | 3.3 pips |
| Days with gap > 3 pips | 41% |
| Days with gap > 5 pips | 21% |
| Max gap observed | 17.4 pips |

### Reference comparison backtest (168 AGREE+NEUTRAL days)

Same simulation config as §14.2; only reference price input differs:

| Config | Reference | gross/trade | net/trade | net_pips (168 days) |
|--------|-----------|-------------|-----------|---------------------|
| A | 10:00 bar close (backtest) | +3.36 | **+2.32** | +1217.5 |
| B | 10:25 bar close (live pre-fix) | +3.09 | **+2.05** | +1120.5 |
| **Delta** | — | **-0.27** | **-0.27** | **-97** |

Net/trade: gross − 1.04 pip spread (same formula as §11).

Daily outcome match rate: 78/168 days (46.4%) — reference gap changes whether triggers fire, not just fill price.

### Fix deployed

`fetchTenAmM5Candle()` pins reference to the 10:00 UTC M5 bar — commit `28425c9`.

### Revised validated figures (post-fix)

- **Updated validated expectancy:** +2.32 net/trade (not +2.88)
- **Annual net pips revised:** ~839 (not ~995)

---

## 16. Limitations

- Backtests use bar OHLC, not live mid-price entry.
- AGREE-only backtests exclude NEUTRAL; live engine includes NEUTRAL (post-2026-05-31).
- Asian Cohort A not viable for inference (2 days).
- `scalper_backtest_grid.csv` uses n=22 — different from production AGREE cohort.
- Spread assumed flat 1.04 pips/trade — not per-config slippage modeled.
- **`auto_direction` backtests (§3–§8) are contaminated** — use `decision_auto_direction` for historical direction (§14).
- Clean backfill ground-truth verified on **one day only** (2026-06-01 = `long`); broader accuracy [VERIFY] as live days accumulate.

---

*BACKTEST Scalper Validation | SignalForge / Veredix | Updated 2026-06-03*
