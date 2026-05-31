# Scalper Backtest Validation — May 2026

**Purpose:** Consolidated reference for all scalper-related backtests. Every performance figure below traces to an exact row in `scripts/output/*.csv`. Numbers not present in CSV are marked `[DATA NEEDED]`.

---

## Changelog

| Date | Change |
|------|--------|
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
**Cohort:** AGREE, 124 days
**Date range:** [DATA NEEDED — not in CSV header; cohort filter is `trade_date >= 2025-05-01` per loader]

| Run | pullback | window | n_days | total_trades | trades/day | win_pct | net_pips_total | expectancy/trade | days_stopped_by_sl | days_no_trigger |
|-----|----------|--------|--------|--------------|------------|---------|----------------|------------------|--------------------|-----------------|
| A | 3 | 10:05–16:00 | 124 | 330 | 2.66 | 68.4 | 893.4 | 2.71 | 74 | 15 |
| **B** | **5** | **10:05–16:00** | **124** | **269** | **2.17** | **73.3** | **1054.6** | **3.92** | **55** | **26** |
| C | 5 | 10:05–14:00 | 124 | 205 | 1.65 | 73.5 | 896.8 | 4.37 | 48 | 32 |

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

**[DATA NEEDED]** — No CSV file exists for the agree_status join. The split was computed ad-hoc from `distribution_no_gate_daily.csv` + `amd_state` but not written to `scripts/output/`. Re-run join and save to CSV before citing split numbers in permanent docs.

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
**Cohort:** [DATA NEEDED — CSV shows n=22, not AGREE 124; different early cohort]

Not used for production decisions.

---

## 11. Contamination Checks Performed

| Backtest | Checks | Result |
|----------|--------|--------|
| `distributionNoGateBacktest` | Q1–Q14 audit (May 2026) | 14/14 PASS |
| `simulatePriceRatchetDay` | Referenced by all distribution scalper backtests | SL before TP, no mid-price, 10:00 ref |
| `asianScalperBacktest` | Separate audit (May 2026) | PASS — uses `asian_m5_candles`, 00:00 ref |

---

## 12. Conclusions (from CSV data only)

1. **Production config validated:** Extended Window Run B — 124 days, +1054.6 net pips, +3.92/trade gross (`scalper_extended_window_grid.csv`).
2. **16:00 window matters:** Same pullback=5/max_ratchets=3 with 14:00 cutoff yields +896.8 (`scalper_price_ratchet_grid.csv` row 5) vs +1054.6 with 16:00 window.
3. **Multi-trade ratchet fires:** Run B avg 2.17 trades/day; max concurrent observed = 3 (same CSV).
4. **No-gate confirms DISAGREE drag:** Full cohort +3.13/trade vs AGREE-only +3.92/trade (compare grid CSVs — AGREE count from extended window).
5. **Asian session:** Cohort B +1.65/trade over 255 days; Cohort A sample too small (2 days).

Net-after-spread figures: **[DATA NEEDED]** — no spread deduction column in CSV outputs.

---

## 13. Limitations

- Backtests use bar OHLC, not live mid-price entry.
- AGREE cohort excludes NEUTRAL (backtest) but live engine includes NEUTRAL (post-2026-05-31).
- No CSV for agree_status split — see §8.
- Asian Cohort A not viable for inference.
- `scalper_backtest_grid.csv` uses n=22 — different from production AGREE cohort.

---

*BACKTEST Scalper Validation | SignalForge / Veredix | May 2026*
