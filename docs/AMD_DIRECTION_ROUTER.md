# AMD Direction Router — Research Findings
**Version:** 1.0.0  
**Date:** June 5, 2026  
**Status:** Research-validated. S3+S4 live-deployable. S1+S2 pending proxy gate.

## Overview

A subgroup routing system that assigns a predicted 12:00–13:00 UTC direction
to each trading day based on AMD outcome tag and signal conditions.
Validated against 284 days of AUDUSD M5 ground truth (May 2025–June 2026).

## Portfolio Summary

| Metric | Value |
|---|---|
| Total routed days | 144 / 284 (50.7%) |
| Combined accuracy | 61.7% |
| Avg gross pips/trade | +3.3p |
| Avg net pips/trade (after 1.5p spread) | +1.8p |
| Total net pips (143 trades) | +254.6p |
| Win rate | 63.6% |
| Trades producing ≥3p | 50.3% |

## Routing Priority (S1 → S5)

Priority is evaluated top-down. First matching rule wins.

### S1 — TEXTBOOK (Judas Inversion)
- **Condition:** `amd_outcome_tag = AMD_TEXTBOOK`
- **Direction:** OPPOSITE of `judas_direction`
  - DOWN Judas → predict LONG (UP)
  - UP Judas → predict SHORT (DOWN)
- **Accuracy:** 66.7% (n=36 non-FLAT days)
- **Avg pips:** +5.6p gross | +4.1p after spread
- **Win rate:** 71.1%
- **MFE:** 10.5p | **MAE:** 5.3p
- **Live-usable:** ❌ — `amd_outcome_tag` not known at 10:31 UTC
- **Live proxy gate:** AGAINST_JUDAS + SUSTAINED M5 → 81.8% TEXTBOOK (n=11)
  Gate: 30+ live AGAINST_JUDAS days needed before production routing

### S2 — COMPRESSION (Judas Continuation)
- **Condition:** `amd_outcome_tag = AMD_COMPRESSION_BREAKOUT`
- **Direction:** SAME as `judas_direction`
  - UP Judas → predict LONG (UP)
  - DOWN Judas → predict SHORT (DOWN)
- **Accuracy:** 60.4% (n=52) | AGREE days: 66.7% (n=20)
- **Avg pips:** +2.6p gross | AGREE days: +4.5p gross
- **Win rate:** 59.6%
- **MFE:** 7.7p | **MAE:** 4.8p
- **Live-usable:** ❌ — `amd_outcome_tag` not known at 10:31 UTC
- **Live proxy gate:** WITH_JUDAS or REVERSED M5 → 73.7–80% COMPRESSION
  Gate: 30+ live REVERSED days needed before production routing
- **Note:** AGREE gate (auto_direction + asian_close aligned) improves
  accuracy from 60.4% to 66.7% and avg pips from +2.6p to +4.5p.
  Prioritize AGREE days when live routing activates.

### S3 — NONE (Fade London)
- **Condition:** `amd_outcome_tag = AMD_NONE`
  (live `amd_tag = AMD_NONE` at 10:31 UTC — already live-usable)
- **Direction:** OPPOSITE of 10:30–12:00 dominant London direction
  - London ran UP 10:30–12:00 → predict DOWN at 12:00
  - London ran DOWN 10:30–12:00 → predict UP at 12:00
  - Signal C: fade the dominant side of candles[6–23]
- **Accuracy:** 54.8% (n=34 with direction)
- **Avg pips:** +1.8p gross | +0.3p after spread
- **Win rate:** 58.8%
- **MFE:** 8.6p | **MAE:** 7.8p
- **Live-usable:** ✅ — AMD_NONE tag known at 10:31 UTC
  London direction computable from M5 candles[6–23] at 12:00 UTC
- **Warning:** +0.3p net after spread is marginal. Monitor closely.
  Park if forward accuracy drops below 52% over 20+ live days.

### S4 — FAILED/SHIFTED with B+C Signal
- **Condition:** `amd_outcome_tag IN (AMD_FAILED, AMD_SHIFTED)`
  AND `judas_pips >= 10`
  AND London direction (10:30–12:00) agrees with Judas inversion
  (B+C: Judas inversion ≥10p AND fade London direction align)
- **Direction:** The B+C agreed direction
- **Accuracy:** 66.7% (n=18 non-FLAT days)
- **Avg pips:** +3.3p gross | +1.8p after spread
- **Win rate:** 68.4%
- **MFE:** 9.9p | **MAE:** 5.6p
- **Live-usable:** ✅
  - AMD_FAILED/SHIFTED tags known at 10:31 UTC
  - judas_pips known at 10:31 UTC
  - London direction computable from M5 candles[6–23] at 12:00 UTC
- **Days:** 19/284 historical (6.7% of days, ~4/month)

### S5 — No Signal
- **Condition:** All other days (FAILED/SHIFTED without B+C agreement)
- **Direction:** None assigned
- **Days:** 140/284 (49.3%)
- **Action:** No directional trade in 12:00–13:00 window

## Live Deployment Status

| Subgroup | Coverage | Status | Gate |
|---|---|---|---|
| S3 NONE | 35 days/yr (12%) | ✅ Live-deployable | None |
| S4 B+C | 19 days/yr (7%) | ✅ Live-deployable | None |
| S1 TEXTBOOK | 38 days/yr (13%) | 🔬 Research only | 30+ AGAINST_JUDAS live days |
| S2 COMPRESSION | 52 days/yr (18%) | 🔬 Research only | 30+ REVERSED live days |
| S5 No signal | 140 days/yr (49%) | ⛔ No trade | N/A |

**Current live coverage: S3+S4 = 54 days/year (19% of trading days)**

## Key Research Findings

1. No single signal predicts 12:00–13:00 direction above 65%
   across all 284 days. Segmentation is required.

2. Composite routing achieves 61.7% accuracy and +1.8p/trade
   net of spread across 144 routed days — the first result
   above coin flip with meaningful n in this research.

3. S3 (NONE fade London) is the weakest subgroup (+0.3p net).
   S1 TEXTBOOK is the strongest (+4.1p net, 66.7% accuracy).

4. B+C combination (Judas>=10p + fade London) identifies
   19 high-conviction FAILED/SHIFTED days at 66.7% accuracy.

5. Exit timing is the next optimization layer. Current exit
   is 13:00 UTC close. MFE of 8–10.5p suggests significant
   improvement possible with earlier exit or TP-based exit.
   This is the next research workstream.

## Signal Definitions

| Signal | Description | Source |
|---|---|---|
| Judas inversion | DOWN Judas → UP distribution | AMD detection at 10:31 |
| Judas continuation | UP Judas → UP distribution | AMD detection at 10:31 |
| Signal B (>=10p) | judas_pips >= 10 | AMD detection at 10:31 |
| Signal C (fade London) | Opposite of candles[6-23] dominant direction | Computable at 12:00 |
| B+C agree | Signal B and C point same direction | Both computable by 12:00 |

## Next Research Workstreams

1. **Exit timing optimization** — test TP 4–10p, exits at 12:45/12:50/12:55/13:00,
   trailing stop options. Target: improve +1.8p/trade to 3p+ net.

2. **S1/S2 proxy gate validation** — accumulate 30+ live days of
   AGAINST_JUDAS+SUSTAINED and REVERSED M5 momentum data.
   Target: activate S1 and S2 routing within 6–12 weeks.

3. **S3 forward monitoring** — 20-day rolling accuracy check.
   Park S3 if accuracy drops below 52%.

4. **Portfolio risk model** — correlated exposure across AMD engine
   and this routing system. Both use AUDUSD. Need position sizing rules.

## Scripts

| Script | Purpose | Output |
|---|---|---|
| amd1200SlotExtraction.ts | Ground truth 12:00-13:00 per day | amd_1200_slot_ground_truth_*.csv |
| amdIndustrySignalBacktest.ts | 3 industry signals tested | amd_industry_signal_backtest_*.csv |
| amdCompositDirectionBacktest.ts | Composite routing S1-S4 | amd_composite_direction_*.csv |

*SignalForge / Veredix — Internal Research — Not for Distribution*
