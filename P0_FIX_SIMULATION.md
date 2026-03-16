# P0 Fix Simulation: EUR_JPY Trade 76 Scenario

**Purpose:** Verify the minimum-age guard prevents false "closed" and does not break legitimate closes.

---

## 1. Actual Event Timeline (from OANDA data)

| Time (UTC) | Event |
|------------|-------|
| 20:00:08.000 | Bridge places EUR/JPY market order (tx 75) |
| 20:00:08.xxx | OANDA fills order (tx 76) — trade 76 created |
| 20:00:08.270 | Bridge inserts bridge_trade_log: status=open, oanda_trade_id=76, signal_received_at=20:00:08.270 |
| 20:00:08.8xx | tradeMonitor runs (same 30s cycle or next tick) |
| 20:00:08.8xx | getOpenTrades() returns list — trade 76 **not yet included** (propagation lag) |
| 20:00:08.8xx | Bridge marks trade 76 closed (BUG) |

---

## 2. Code Path Simulation: WITHOUT P0 Fix (Original Behavior)

```
runTradeMonitor()
  ├─ getOpenTrades() → oandaIds = { "72", "68" }  (76 missing)
  ├─ logOpen = [ row_76, row_72, row_68, ... ]
  │
  └─ for row_76:
       tid = "76"
       openTime = "2026-03-12T20:00:08.270Z"
       elapsed = now - 20:00:08.270 ≈ 600 ms
       │
       ├─ !oandaIds.has("76") → TRUE (76 not in list)
       │
       ├─ [NO GUARD] → proceed
       │
       ├─ getClosedTradeDetails("76", openTime) → { exitPrice: null, pnlDollars: null }
       │   (no close tx exists; trade still open on OANDA)
       │
       ├─ UPDATE status='closed', exit_price=null, pnl_dollars=null, result='breakeven'
       │
       └─ BUG: Trade 76 incorrectly marked closed
```

**Result:** Bridge shows closed, OANDA shows open. Mismatch.

---

## 3. Code Path Simulation: WITH P0 Fix (New Behavior)

```
runTradeMonitor()
  ├─ getOpenTrades() → oandaIds = { "72", "68" }  (76 missing)
  ├─ logOpen = [ row_76, row_72, row_68, ... ]
  │
  └─ for row_76:
       tid = "76"
       openTime = "2026-03-12T20:00:08.270Z"
       elapsed = now - 20:00:08.270 ≈ 600 ms
       │
       ├─ !oandaIds.has("76") → TRUE (76 not in list)
       │
       ├─ elapsed < MIN_OPEN_AGE_MS → 600 < 60_000 → TRUE
       │
       ├─ continue  ← SKIP (do not mark closed)
       │
       └─ Trade 76 stays status='open' ✓
```

**Result:** Trade 76 correctly remains open. No update. No false close.

---

## 4. Subsequent Monitor Run (~20:00:38 UTC, 30s later)

```
runTradeMonitor()
  ├─ getOpenTrades() → oandaIds = { "76", "72" }  (76 now included)
  │
  └─ for row_76:
       elapsed ≈ 30_000 ms
       oandaIds.has("76") → TRUE
       │
       ├─ Skip "not in oandaIds" block entirely
       │
       ├─ elapsed >= maxHold? 30_000 < 4*3600*1000 → no
       │
       └─ No action. Trade 76 stays open ✓
```

**Result:** Trade 76 continues correctly as open until OANDA actually closes it (TP/SL/max_hold).

---

## 5. Legitimate Close Simulation (when trade 76 actually hits TP/SL)

**Assume:** Trade 76 hits TP at 21:30:00 UTC (90 minutes later).

```
runTradeMonitor()
  ├─ getOpenTrades() → oandaIds = { "72" }  (76 gone; closed by OANDA)
  │
  └─ for row_76:
       elapsed = 90 * 60 * 1000 = 5_400_000 ms
       │
       ├─ !oandaIds.has("76") → TRUE (76 not in list)
       │
       ├─ elapsed < MIN_OPEN_AGE_MS → 5_400_000 < 60_000 → FALSE
       │
       ├─ getClosedTradeDetails("76", openTime) → { exitPrice: 183.669, pnlDollars: +X, closedTime: "..." }
       │   (close tx exists; trade was closed by OANDA)
       │
       ├─ UPDATE status='closed', exit_price=183.669, pnl_dollars=+X, result='win'
       │
       └─ Correct close recorded ✓
```

**Result:** Legitimate close is detected and recorded. P0 guard does not block.

---

## 6. Edge Case: Trade Closes Within 60 Seconds

**Scenario:** Trade opens at T=0, hits TP at T=45s. Very fast win.

```
runTradeMonitor() at T=50s:
  ├─ getOpenTrades() → 76 not in list (closed by OANDA at T=45s)
  │
  └─ for row_76:
       elapsed = 50_000 ms
       │
       ├─ !oandaIds.has("76") → TRUE
       │
       ├─ elapsed < MIN_OPEN_AGE_MS → 50_000 < 60_000 → TRUE
       │
       └─ continue  ← SKIP
```

**Result:** Trade 76 is skipped this cycle. Bridge still shows open.

**Next run at T=80s:**
```
  elapsed = 80_000 ms
  elapsed < MIN_OPEN_AGE_MS → 80_000 < 60_000 → FALSE
  → proceed with getClosedTradeDetails → UPDATE to closed ✓
```

**Result:** One cycle delay (up to 30s). Trade eventually marked closed correctly. Acceptable trade-off.

---

## 7. Decision Table

| elapsed (ms) | In oandaIds? | Action |
|--------------|--------------|--------|
| 500 | no | **Skip** (P0 guard) — avoid false close ✓ |
| 30_000 | no | **Skip** (P0 guard) — still in lag window |
| 60_001 | no | **Mark closed** — age OK, treat as closed ✓ |
| 5_400_000 | no | **Mark closed** — age OK, TP/SL hit ✓ |
| any | yes | No update (trade still open) ✓ |

---

## 8. Verification Checklist

- [x] EUR_JPY 76 scenario: would have been skipped (elapsed ~600 ms < 60_000)
- [x] Legitimate close after 90 min: would proceed (elapsed > 60_000)
- [x] Fast close (45s): delayed one cycle, then correct
- [x] max_hold path unchanged (separate branch, uses elapsed >= maxHold)

---

**Conclusion:** The P0 fix correctly prevents the EUR_JPY 76 class of bugs and does not block legitimate closes. The only impact is a one-cycle delay for trades that close within 60 seconds (rare).
