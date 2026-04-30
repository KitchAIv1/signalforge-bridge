# Engine Rebuild — Bar1 M1 Strength Layer
## Research, Validation & Implementation Spec
*April 2026 | SignalForge / Veredix | Confidential*

---

## 1. Background

Engine Rebuild is a GBPUSD M5 compression-breakout 
scalper. Pattern: 3-candle DTW sequence where candles 
1-2 compress and candle 3 breaks out. Max hold 30 min.

Filtered shadow performance (151 signals, Apr 13-27):
- TP rate: 34.3%
- Avg P&L R: +0.303R
- Signals/day: ~12.7

Problem: Live execution produced 10.5% win rate on 
first 19 trades. Three root causes identified and fixed 
(RC1/RC2/RC3). But even after fixes, the fundamental 
question remained: can we identify winning vs losing 
signals before execution?

---

## 2. The Discovery — Bar1 M1 Strength

### What Bar1 Measures

After a signal fires at candle 3 close (signal_time), 
the market has 5 minutes before the next M5 candle 
closes. During those 5 minutes (bar1), price reveals 
whether it is agreeing or disagreeing with the signal.

Bar1 strength = max favorable R minus max adverse R 
during the first 5 M1 candles after signal.

- Positive net R = market moving WITH the signal
- Negative net R = market moving AGAINST the signal

### Validation Method

All testing used real OANDA M1 candle data fetched 
at signal_time. No look-ahead bias. Outcome_candles 
post-trade data was NOT used for the filter decision.

Script: engine-rebuild/scripts/simulateBar1AlignmentValid.ts
Runtime: 95.9 seconds on 153 filtered signals.

### Results (81 bar1-aligned signals, real M1 data)

| Metric | Value |
|---|---|
| Signals aligned (net > 0) | 81 of 153 (52.9%) |
| Signals against (net ≤ 0) | 72 of 153 (47.1%) |
| Aligned M1 TP rate | 30.9% |
| Aligned M1 avg P&L R | +0.483R |
| Against shadow avg P&L R | -0.286R |

Weekly stability (M1 real-time):
- Apr 13-17: 38 signals, 31.6% TP, +0.505R
- Apr 20-26: 28 signals, 25.0% TP, +0.503R
- Apr 27+:   15 signals, 40.0% TP, +0.389R

All three weeks independently positive. Finding confirmed.

---

## 3. Bar1 Strength Buckets

Strength is classified by bar1 net R threshold:

| Strength | Net R | n | M1 TP% | M1 AvgR | Shadow TP% |
|---|---|---|---|---|---|
| strong   | >0.5R  | 41 | 39.0% | +0.590R | 65.9% |
| moderate | 0.2-0.5R | 26 | 26.9% | +0.446R | 38.5% |
| weak     | 0-0.2R | 15 | 13.3% | +0.274R | 33.3% |
| against  | ≤0     | 73 | n/a   | -0.296R shadow | 13.7% |

Strong bar1 weekly stability (shadow data):
- Apr 13-17: 17 signals, 52.9% TP, +0.918R
- Apr 20-26: 14 signals, 78.6% TP, +1.115R
- Apr 27+:    6 signals, 66.7% TP, +0.875R

Shadow average across all weeks: 64.9% TP — the 66% 
flip target identified at project start.

---

## 4. Architecture Decision

### Approach: Sizing, Not Blocking

All signals execute regardless of bar1 strength.
Frequency is preserved at ~12.7 signals/day.
Bar1 strength determines position size only.

This aligns with the system design principle:
add intelligent layers, never reduce frequency.

### Position Sizing Multipliers (Validated)

| Strength | Multiplier | Rationale |
|---|---|---|
| strong   | 2.0× | 39% M1 TP, +0.590R — max conviction |
| moderate | 1.0× | 26.9% TP, +0.446R — base size |
| weak     | 0.75× | 13.3% TP, +0.274R — reduced |
| against  | 0.25× | -0.296R shadow — minimal exposure |
| no_data  | 0.5× | OANDA fetch failed — cautious |

### 5-Minute Wait

Bridge holds execution for bar1 window to complete.
Wait = (signal_time + 5 minutes) - now()
If signal_time + 5 min has already passed: no wait.
processSignal is async — wait is safe for rebuild only.
Other engines process independently, unaffected.

---

## 5. What Bar1 Detects

Bar1 M1 correctly identifies signal direction in 
real time. When bar1 net R > 0, the market is 
confirming the signal direction. When ≤ 0, the 
market is rejecting it.

This is not a look-ahead signal — it uses only 
real OANDA M1 price data available after bar1 closes.

The direction flip hypothesis (taking bar1-against 
signals in the opposite direction) was tested and 
rejected. Against signals averaged -0.252R flipped 
vs -0.286R original — no material improvement. 
Against signals represent choppy indecisive price 
action, not directional momentum in either direction.

---

## 6. Implementation — Committed But Not Deployed

Commit: e28c75f
Branch: main (pending Railway deployment decision)

Files changed:
- src/core/signalRouter.ts
- supabase/migrations/008_bar1_columns.sql

### New Function: fetchBar1Strength()

Location: src/core/signalRouter.ts, line 99
Scope: engine_rebuild only

Fetches 5 M1 candles from OANDA for the bar1 window.
Computes maxFav and maxAdv relative to entry price 
and stop loss distance (rSize).
Returns: bar1NetR, bar1FavR, bar1AdvR, strength bucket.
Timeout: 15 seconds. On any failure: returns no_data.

### Modified: finalUnits block

Previous: hour13Multiplier (1.5× at hour 13 UTC)
Current: bar1Multipliers (strength-based sizing)

Hour13 multiplier removed — bar1 strength is a more 
precise and empirically validated signal than hour of 
day alone.

### New Columns: bridge_trade_log

Migration 008 adds:
- bar1_net_r    numeric  — net R (fav minus adv)
- bar1_fav_r    numeric  — max favorable R in bar1
- bar1_adv_r    numeric  — max adverse R in bar1
- bar1_strength text     — bucket classification

Columns only populated for engine_rebuild EXECUTED 
trades when bar1 data was successfully fetched.

---

## 7. Execution Fixes Already Live (pre-bar1)

Commit 6f1a851 (deployed):

RC1 — patchTradeTPSL retry logic
  TP placement retries once on failure.
  CRITICAL log if both attempts fail.
  Never silently drops TP order.

RC2 — SL widened 1.5 pips
  Gives trade room to survive OANDA tick spikes
  that shadow bar-walk (close prices) never detects.
  engine_rebuild only.

RC3 — Correct TP math
  actualRiskRaw = |fillPrice - widenedSL|
  correctedTP = fillPrice ± actualRiskRaw × 1.5
  Guarantees R:R = exactly 1.500 on every trade.
  Previous bug used fillPrice-to-originalSL which
  inflated rSizeRaw by spread, collapsing R:R below 1.0
  on small stops.

Hour blocks confirmed active:
  [0,1,2,3,4,5,6,7,9,10,14,15,19,20,21]

Dynamic unit cap:
  equity × 0.50 / 4 positions × 50 leverage / 1.355
  Scales with account size. Floor 1000, ceiling 500,000.

---

## 8. Mission Math

Base case (M1 validated, conservative):
  Aligned signals/day: ~5.4
  M1 avg P&L R: +0.483R
  Daily R: 2.61R

With bar1 strength sizing (all signals):
  Strong (3.4/day × 0.590R × 2.0×): +4.01R
  Moderate (2.2/day × 0.446R × 1.0×): +0.98R
  Weak (1.25/day × 0.274R × 0.75×): +0.26R
  Against (6.1/day × -0.296R × 0.25×): -0.45R
  Total daily R: ~4.80R

At $200 base risk per trade:
  Daily: $960
  Monthly: ~$21,000 (compounding)

From $1,000 starting capital at safe dynamic sizing:
  Month 12: ~$42,000
  Month 18: ~$390,000
  Month 21: ~$1,000,000

Note: projections are directional estimates.
True live performance will be the final arbiter.
Minimum 50 live trades required before adjusting 
any strength thresholds.

---

## 9. Pending Items

- [ ] Deploy commit e28c75f to Railway (currently 
      reverted in production at 465a85b)
- [ ] First live trade with bar1 data — verify 
      bar1_strength column populated in Supabase
- [ ] Monitor strength distribution across 50+ trades
- [ ] Verify 5-minute wait appearing in Railway logs
- [ ] After 50+ trades: compare M1 TP rate per 
      strength bucket to simulation results
- [ ] Consider: block hour 10 in shouldBlockRebuild 
      (currently blocked in dashboard indicator but 
      verify live bridge has it blocked)

---

## 10. Key Learnings

1. Shadow data uses candle close prices for SL/TP 
   detection. OANDA uses ticks. This gap is structural 
   and permanent — account for it in all projections.

2. Bar1 M5 close direction (close > open) is a poor 
   proxy for bar1 quality. Use M1 intrabar max 
   favorable vs max adverse instead.

3. Reducing signal frequency is never the solution. 
   Add intelligent layers that size by conviction.

4. The 66% TP target exists in shadow data (64.9% 
   on strong bar1 signals). Live execution degrades 
   it to ~39% M1 due to tick-level SL execution. 
   The gap is RC2 — structural, not fixable by code.

5. Direction flip (bar1-against signals taken in 
   opposite direction) does not work. Against signals 
   are choppy, not directionally committed either way.

*Engine Rebuild Bar1 Layer | April 2026 | Confidential*
