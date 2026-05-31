# Scalper Backtest Validation — May 2026

**Purpose:** Consolidated reference for all scalper-related backtests. Every performance figure traces to an exact row in `scripts/output/*.csv`. Spread-adjusted figures use `expectancy_net = expectancy_gross - 1.04` from `scalper_net_after_spread_summary.csv`.

---

## Changelog

| Date | Change |
|------|--------|
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

---

## 14. Limitations

- Backtests use bar OHLC, not live mid-price entry.
- AGREE-only backtests exclude NEUTRAL; live engine includes NEUTRAL (post-2026-05-31).
- Asian Cohort A not viable for inference (2 days).
- `scalper_backtest_grid.csv` uses n=22 — different from production AGREE cohort.
- Spread assumed flat 1.04 pips/trade — not per-config slippage modeled.

---

*BACKTEST Scalper Validation | SignalForge / Veredix | May 2026*
