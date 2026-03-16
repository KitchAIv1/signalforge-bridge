# Bridge–Engine Alignment Audit

**Purpose**: Map Bridge's use of engine signals and define what Engines must provide/verify for accurate alignment.

---

## 1. Your Understanding — Corrected

| Your statement | Correction |
|----------------|------------|
| "PIPs of engine should be the same as BRIDGE" | **Mostly correct.** Bridge passes engine's `stop_loss` and `target_1` **prices** directly to OANDA. Pip *distance* (SL/TP from entry) should match *if* both use the same **entry price**. Bridge uses `(entry_zone_low + entry_zone_high) / 2`; engines may use a different entry (e.g. actual fill, different midpoint). After fill, Bridge uses OANDA's `fill_price`; engines may use their own feed → pip drift during trade. |
| "Margins will only differ in profits" | **Correct.** Bridge controls **position size (units)**. Same pip move → same pips, but different $ because Bridge calculates units from equity, risk%, engine weight, etc. |

**Summary**: SL/TP *prices* are pass-through. Pip *distance* can diverge if entry or price feed differs. Dollar P&L always differs (Bridge's sizing).

---

## 2. Bridge Data Flow (Audit)

```
ENGINE (signals table)                    BRIDGE                          OANDA
────────────────────────────────────────────────────────────────────────────────────

id ──────────────────────────────────► signal_id (log)
engine_id ───────────────────────────► engine_id, bridge_engines lookup
pair (USDCAD) ────────────────────────► toOandaInstrument() → USD_CAD
direction ────────────────────────────► LONG | SHORT (buy→LONG, sell→SHORT)
confluence_score ──────────────────────► risk threshold, position scaling ±15%
entry_zone_low, entry_zone_high ───────► entry = (low+high)/2 (validation, sizer)
stop_loss ────────────────────────────► stopLossPrice → OANDA (exact pass-through)
target_1 ─────────────────────────────► takeProfitPrice → OANDA (exact pass-through)
  (OR take_profit if target_1 null)
stop_loss_pips ──────────────────────► slPipsOverride for position sizing ONLY
target_1_pips ───────────────────────► NOT USED by Bridge (reference only)
created_at ───────────────────────────► signal_received_at, stale check
```

### Bridge never modifies SL/TP prices
- `signalValidation.ts` line 76-82: TP from `target_1` else `take_profit` else self-calc from SL distance × defaultRiskReward
- `signalRouter.ts` line 177-178: `norm.stopLoss.toFixed(...)`, `norm.takeProfit.toFixed(...)` sent to OANDA
- Precision: JPY → 3 decimals, others → 5 decimals

### Bridge calculates position size (units)
- `positionSizer.ts`: `riskAmount = equity × engineWeight × riskPct` / `(pipDist × pipValuePerUnit)`
- `pipDist`: from `stop_loss_pips` if provided, else `|entry - stopLoss| × 10000` (×100 for JPY)
- `pipValuePerUnit`: uses live conversion rates (USD_JPY, USD_CAD, etc.) for non-USD quote pairs

---

## 3. What Bridge Expects from Engine (signals row)

| Column | Required | Bridge use |
|--------|----------|------------|
| `id` | Yes | signal_id |
| `engine_id` | Yes | lookup bridge_engines |
| `pair` | Yes | instrument (USDCAD → USD_CAD) |
| `direction` | Yes | long/short |
| `confluence_score` | Yes | threshold, sizing |
| `entry_zone_low` | Yes | entry calc |
| `entry_zone_high` | Yes | entry calc |
| `stop_loss` | Yes | sent to OANDA as-is |
| `target_1` | Prefer | TP price; else take_profit; else Bridge self-calc |
| `stop_loss_pips` | Preferred | position sizing; else Bridge computes from prices |
| `take_profit` | If no target_1 | TP price |
| `target_1_pips` | Optional | not used by Bridge |
| `created_at` | Yes | stale check, signal_received_at |

---

## 4. OANDA TP/SL Semantics (Critical for Engine Alignment)

OANDA triggers orders based on **BID** and **ASK**:

| Direction | Stop-Loss triggered when | Take-Profit triggered when |
|-----------|--------------------------|-----------------------------|
| **LONG** | BID touches SL price | ASK touches TP price |
| **SHORT** | ASK touches SL price | BID touches TP price |

If the engine uses **MID** or a different feed to detect “TP hit”, it can mark a trade as closed/win when OANDA has not triggered TP. That causes Engine vs Bridge disagreement.

---

## 5. Root Cause of USDCAD Alpha Discrepancy

- **Engine Alpha dashboard**: Showed WIN +13.8 pips (TP hit).
- **Bridge + OANDA**: Trade 72 still OPEN (no TP hit).

Engine used its own price feed (likely MID or delayed) and decided TP was hit. OANDA’s BID never reached the TP level, so the trade stayed open. The fix belongs in the **Engine**: it must either:

1. Use OANDA-compatible semantics (BID for SHORT TP, ASK for SHORT SL), or  
2. Not mark a trade as closed until Bridge/OANDA reports it.

---

## 6. Information Needed from ENGINES Agent

Ask the Engines Cursor agent to provide:

### A. Signal INSERT contract
1. Which columns does the engine write to `signals` for each new signal?
2. How is `entry_zone_low` / `entry_zone_high` computed? (e.g. candle levels, EMA, etc.)
3. Are `stop_loss` and `target_1` the exact prices sent to Bridge, or are they derived with rounding?

### B. TP/SL “hit” detection (engine dashboard / signal_outcomes)
1. What price feed does the engine use to decide “TP hit” / “SL hit”? (MID, BID, ASK, close, VWAP, etc.)
2. For SHORT: does it use BID for TP and ASK for SL (as OANDA does)?
3. Where is this logic implemented? (file + function names)

### C. signal_outcomes table
1. Schema of `signal_outcomes` (all columns).
2. Who writes to it? (engine only, or does Bridge write?)
3. How is `result` (win/loss) computed? From which price and which table?

### D. Pip calculation
1. How does the engine compute “pips” for a trade? (formula, e.g. `|price - entry| × 10000`).
2. Which “entry” is used? (zone midpoint, first fill, signal time price?)
3. Which “exit” is used? (current price, close price, OANDA fill?)

### E. Align with OANDA
1. Can the engine switch to BID/ASK (or OANDA-equivalent) for TP/SL detection?
2. Or can the engine defer “closed” status until it receives an update from Bridge?

---

## 7. Quick Verification Queries (Engines agent)

Run against a recent USDCAD signal that had discrepancy:

```sql
-- Engine signal
SELECT id, engine_id, pair, direction,
       entry_zone_low, entry_zone_high,
       stop_loss, target_1,
       stop_loss_pips, target_1_pips,
       created_at
FROM signals
WHERE pair ILIKE '%USDCAD%' AND id = '<signal_id>';

-- Bridge execution (same signal)
SELECT signal_id, fill_price, stop_loss, take_profit,
       exit_price, pnl_dollars, result, status
FROM bridge_trade_log
WHERE signal_id = '<signal_id>' AND decision = 'EXECUTED';
```

Check:
- `stop_loss` and `target_1` in signals = `stop_loss` and `take_profit` in bridge_trade_log (Bridge passes them through).
- `fill_price` (OANDA) vs `(entry_zone_low+entry_zone_high)/2` (Bridge entry).

---

## 8. Files Reference (Bridge codebase)

| File | Role |
|------|------|
| `src/connectors/supabase.ts` | SignalInsertPayload, Realtime on signals |
| `src/core/signalValidation.ts` | Validates payload, normalizes, TP from target_1 |
| `src/core/signalRouter.ts` | Pipeline, placeMarketOrder with norm.stopLoss, norm.takeProfit |
| `src/core/positionSizer.ts` | Units from stop_loss_pips or \|entry-SL\| |
| `src/connectors/oanda.ts` | placeMarketOrder sends SL/TP prices to OANDA |
| `src/monitoring/tradeMonitor.ts` | Detects close via OANDA, writes exit_price, pnl_dollars, result |

---

## 9. Engine Alignment Answers — Verified & Gap Analysis

### A. Signal INSERT Contract ✅ Aligned

| Topic | Engine | Bridge | Status |
|-------|--------|--------|--------|
| Columns | signalLogger.logSignal() → pair, direction, engine_id, entry_zone_low/high, stop_loss, target_1, stop_loss_pips, target_1_pips, etc. | Uses same fields | ✅ |
| Entry zone | `entrySpread = currentAtr * 0.15`; low = price - spread, high = price + spread; `price` = last H1 close | `entry = (low+high)/2` | ✅ Same formula |
| SL/target_1 | Raw floats, no rounding; NUMERIC(12,6) | Pass-through to OANDA | ✅ |

### B. TP/SL Hit Detection ⚠️ Misaligned (root cause)

| Topic | Engine | OANDA (ground truth) | Gap |
|-------|--------|----------------------|-----|
| Price feed | Charlie: OANDA v3 candles `price=M` (MID). Alpha/Delta: Yahoo Finance OHLC | BID/ASK for TP/SL triggers | **Different feeds** |
| SHORT TP | `candle.low <= target1 - halfSpread` | BID must touch target1 | MID low can hit before BID |
| SHORT SL | `candle.high >= stopLoss - halfSpread` | ASK must touch stopLoss | MID high can lag ASK |
| Half-spread | `typicalSpreadPips / 2 * pipSize` (static per pair) | Live spread varies | **Static vs dynamic** |

Engine file: `src/services/PositionResolverService.ts` → `resolvePositionAgainstCandle()`

**Why Alpha showed WIN while Bridge had trade still open**  
- Alpha uses Yahoo; Charlie uses OANDA MID. Both are **MID-like**.  
- For SHORT TP: OANDA triggers when **BID** reaches TP. BID ≈ MID − halfSpread.  
- With MID candles, `candle.low` can reach TP before BID does (or the engine’s low can be at a different time than when OANDA would trigger).  
- `typicalSpreadPips` is fixed; real spread can be wider → engine marks TP hit too early.  
- Engine never waits for Bridge; it resolves from its own candles and logs outcomes independently.

### C. signal_outcomes ✅ Understood

- **Schema**: signal_id, exit_price, pnl_pips, result, target_hit, duration_minutes, closed_at, etc.
- **Writer**: Engine only (`signalLogger.logOutcome()` called from `PositionResolverService`).
- **result**: TP hit → win; SL hit → loss; time exit → `pnlPips > 0 ? 'win' : 'loss'`.

### D. Pip Calculation ✅ Compatible

- Engine: `pnlRaw = direction === LONG ? exitPrice - entryPrice : entryPrice - exitPrice`; `pnlPips = round((pnlRaw/pipSize)*10)/10`.
- Entry: `(entry_zone_low + entry_zone_high) / 2` (matches Bridge).
- Exit: TP/SL → `position.target1` or `position.stopLoss`; time exit → `latestCandle.close`.

### E. Alignment Options

| Option | Description | Owner |
|--------|-------------|-------|
| 1. Bridge → Engine events | Bridge publishes close events (signal_id, exit_price, pnl, result); engine consumes and logs outcome instead of resolving from candles | Bridge + Engine |
| 2. Engine uses OANDA BID/ASK | Engine fetches OANDA BID/ASK (or equivalent) for TP/SL detection | Engine |
| 3. Engine defers closed status | Engine treats “closed” only when Bridge has status=closed (requires Bridge to write to shared table or emit events) | Engine + Bridge |
| 4. Improve half-spread | Use live spread or more conservative offset; reduces false TP hits but does not fully match OANDA | Engine |

---

## 10. Recommended Fix Path

1. **Short term (Engine)**  
   - Prefer **Option 3**: Engine does not write to `signal_outcomes` until it learns the trade is closed from Bridge (or a Bridge-populated table).  
   - Or use **Option 4**: Increase or dynamically adjust `typicalSpreadPips` for TP detection to reduce early TP marking (mitigation only).

2. **Medium term (Bridge + Engine)**  
   - Implement **Option 1**: Bridge writes close events (or updates a shared table) when `tradeMonitor` closes a trade. Engine subscribes and updates `signal_outcomes` from that source instead of candle resolution.

3. **Long term (Engine)**  
   - Implement **Option 2**: Use OANDA BID/ASK (or equivalent) for TP/SL detection so engine and OANDA semantics match.
