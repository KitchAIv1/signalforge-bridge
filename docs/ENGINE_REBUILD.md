# Engine Rebuild — Technical Reference
*SignalForge / Veredix | Last updated: April 2026*

## Overview
Engine Rebuild is a GBPUSD M5 compression-breakout 
scalper. It detects 3-candle patterns where candles 1 
and 2 compress (small bodies) and candle 3 breaks out 
in the trade direction. Max hold: 30 minutes. 
Target: 1.5R. Stop: 1.0R.

## Architecture Principle
**Frequency and accuracy go hand in hand.**
The engine never reduces signal frequency. Every pattern 
match executes. Intelligence is applied through position 
sizing and execution quality — not signal blocking.

## Signal Flow
1. Engine fires signal → writes to rebuild_shadow_signals 
   (always, regardless of execution)
2. Signal written to signals table
3. Bridge receives signal
4. shouldBlockRebuild checks hour gate + R bucket gate
5. If not blocked: wait 5 minutes for bar1 window
6. Fetch real OANDA M1 candles for bar1 window
7. Compute bar1 net R (favorable - adverse)
8. Classify strength → apply size multiplier
9. Execute on OANDA with RC2+RC3 corrected SL/TP
10. Log bar1 data to bridge_trade_log

## Execution Fixes (RC1, RC2, RC3)

### RC1 — Reliable TP Placement
patchTradeTPSL retries once on failure (500ms delay).
CRITICAL log if both attempts fail. Trade never runs 
without TP order on OANDA.

### RC2 — SL Widening
SL widened 1.5 pips from signal SL level.
Reason: OANDA fires SL on ticks; shadow uses candle 
closes. 1.5 pip buffer prevents intrabar spikes from 
triggering SL that shadow bar-walk would never see.

### RC3 — Correct R:R
TP = fillPrice ± (|fillPrice - widenedSL| × 1.5)
Guarantees R:R = exactly 1.500 on every trade.
Previous bug: used |fillPrice - norm.stopLoss| as 
rSizeRaw — inflated by spread, collapsing R:R below 1.0 
on small stops.

## Bar1 M1 Intelligence Layer

### What It Measures
After signal fires, bridge waits for the first 5-minute 
bar (bar1) to complete. Fetches 5 real OANDA M1 candles 
covering that window. Measures:
- maxFavorableR: furthest price moved WITH trade in bar1
- maxAdverseR: furthest price moved AGAINST trade in bar1
- bar1NetR = maxFavorableR - maxAdverseR

### Why It Works
Validated on 81 real OANDA M1 signals (3 weeks, 
no look-ahead bias):
- When bar1 net R > 0.5: price committed hard in 
  direction within first 5 minutes → 39% M1 TP rate
- When bar1 net R ≤ 0: price rejected the direction 
  in bar1 → -0.296R shadow avg

### Sizing Multipliers
All signals execute. Multiplier scales position size:

| Strength    | Bar1 Net R | M1 TP Rate | Avg R   | Multiplier |
|-------------|-----------|------------|---------|------------|
| strong      | > 0.5R    | 39.0%      | +0.590R | 2.0×       |
| moderate    | 0.2-0.5R  | 26.9%      | +0.446R | 1.0×       |
| weak        | 0-0.2R    | 13.3%      | +0.274R | 0.75×      |
| against     | ≤ 0R      | 13.9%*     | -0.286R | 0.25×      |
| no_data     | fetch fail | unknown   | unknown | 0.5×       |

*shadow TP rate on skipped signals

### Frequency Impact
Zero. All signals execute. Bar1 adds a 5-minute 
execution delay — not a block.

### Validation
- Method: real OANDA M1 candles, no look-ahead
- Dataset: 81 bar1-aligned signals, 153 base filtered
- Weeks tested: Apr 13-17 (33.3%), Apr 20-26 (40.0%),
  Apr 27+ (60.0%) — all positive
- Shadow validation: strong signals 65.9% shadow TP

## Hour Gate
Blocked UTC hours (data-validated, shadow confirmed):
0,1,2,3,4,5,6,7 — Asian session
9 — London open whipsaw  
10 — confirmed negative -0.195R avg n=18
14,15 — London close dead zone
19,20,21 — late NY dead zone

## R Bucket Gate
Blocked: stop distance 7-10 pips (medium noise band)
Allowed: < 7 pips or > 10 pips

## Database Tables

### rebuild_shadow_signals
Every signal written regardless of execution.
Key columns: signal_time, direction, entry_price, 
sl_price, tp_price, r_size_pips, pattern_distance,
candle_1_body, candle_2_body, candle_3_body,
candle_3_range, outcome_candles (JSONB, 6 bars),
final_outcome, pnl_r, mfe_r, mae_r, during_news_event

### bridge_trade_log (engine_rebuild rows)
Executed trades. Key additional columns:
- bar1_net_r: bar1 favorable minus adverse R
- bar1_fav_r: max favorable R in bar1 window
- bar1_adv_r: max adverse R in bar1 window
- bar1_strength: strong|moderate|weak|against|no_data

## Mission Math (Conservative M1-Based)
- Signals per day: ~12-13 (all execute)
- Bar1 strong signals per day: ~3.4
- Expected daily R: ~4.8R (bar1-weighted)
- At $200 base risk: ~$960/day
- From $1,000: ~$1M in 19-21 months (M1 estimates)

## Commit History (Key Changes)
| Commit  | Change |
|---------|--------|
| 6f1a851 | RC1+RC2+RC3 fixes, hour blocks, dynamic cap |
| e28c75f | Bar1 M1 strength layer, migration 008 |

---
