# BRIDGE MAXIMUM AUDIT & MAPPING DOCUMENT

**Goal:** Full context, scenario simulation, and edge-case identification to achieve 100% accuracy when handling real money.

---

## PART 1: SYSTEM ARCHITECTURE

### 1.1 Entry Point & Startup Sequence

**File:** `src/index.ts`

```
1. loadBridgeConfig(supabase)
2. If !bridge_active → exit
3. loadActiveEngines(supabase)
4. getAccountSummary() → initCircuitBreaker, updatePeakEquity
5. runStartupReconciliation(supabase)
6. setInterval(heartbeat, 30s)
7. setInterval(tradeMonitor, 30s)
8. subscribeToSignalInserts(realtime on signals table)
9. Process queued signals (if any arrived before ready)
10. scheduleMidnightReset() for trades_today
```

**Dependencies:** Supabase, OANDA, bridge_config, bridge_engines, bridge_trade_log.

---

### 1.2 Signal Flow (Realtime → OANDA)

**Trigger:** Supabase Realtime `INSERT` on `signals` table.

**Pipeline (signalRouter.processSignal):**

| Step | Check | Block Reason | File:Line |
|------|-------|--------------|-----------|
| 0 | Stale | `age > staleSignalMaxAgeMs` (60s default) | signalRouter:86-89 |
| 1 | Validation | engine_id, pair, direction, SL, confluence, entry zone | signalValidation |
| 2 | Latency | `decisionLatencyMs > maxLatencyMs` (500ms) | signalRouter:98-101 |
| 3 | Engine | Unregistered or inactive | signalRouter:103-107 |
| 4 | Circuit breaker | Kill switch, drawdown, cooldown | signalRouter:110-117 |
| 5 | Dedup | Same pair+direction within 30s | signalRouter:119-123 |
| 6 | Conflict | Open opposite position | signalRouter:124-127 |
| 7 | Risk | Per-pair limit, correlation, market hours, etc. | signalRouter:136-155 |
| 8 | Execute | placeMarketOrder to OANDA | signalRouter:175-206 |

**On success:** Insert `bridge_trade_log` with `decision=EXECUTED`, `status=open`, `oanda_trade_id`, `fill_price`, `units`.

**On OANDA cancel:** Log with `decision=BLOCKED` (e.g. TAKE_PROFIT_ON_FILL_LOSS).

---

### 1.3 Trade Monitor Flow

**File:** `src/monitoring/tradeMonitor.ts`  
**Interval:** 30s (configurable)

```
1. getOpenTrades() → oandaIds
2. SELECT from bridge_trade_log WHERE status='open' AND oanda_trade_id IS NOT NULL
3. For each row:
   a. If tid NOT in oandaIds → treat as closed
      - getClosedTradeDetails(tid, signal_received_at)
      - UPDATE status='closed', exit_price, pnl_dollars, result, closed_at, duration_minutes
   b. Else if elapsed >= max_hold_hours → close via closeTrade(tid)
      - UPDATE status='closed', close_reason='max_hold', exit_price, pnl_dollars, result
```

---

### 1.4 Startup Reconciliation

**File:** `src/startupReconciliation.ts`

```
1. getOpenTrades() from OANDA
2. SELECT open rows from bridge_trade_log
3. For each OANDA trade NOT in log: INSERT "reconciled" row
4. prePopulateDedupFromLog(EXECUTED in last 60s)
```

---

## PART 2: EXTERNAL API SURFACE

### 2.1 OANDA Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/accounts/{id}/summary` | GET | Account summary |
| `/v3/accounts/{id}/openTrades` | GET | List open trades |
| `/v3/accounts/{id}/pricing?instruments=` | GET | BID/ASK for conversion rates |
| `/v3/accounts/{id}/orders` | POST | Place market order (with SL/TP) |
| `/v3/accounts/{id}/transactions?from=&to=&pageSize=100` | GET | Close details |
| `/v3/accounts/{id}/trades/{id}/close` | PUT | Close trade (max_hold) |

### 2.2 OANDA Behavior Assumptions

- `openTrades` returns all open trades (no pagination in code).
- New trade appears in `openTrades` immediately after fill.
- Transactions API returns the close transaction within `from`–`to`.
- Trade IDs are numeric strings (e.g. `"76"`).

---

## PART 3: EDGE CASES & SCENARIOS

### 3.1 Confirmed Bug: New-Trade False Close (EUR_JPY Trade 76)

| Scenario | Current Behavior | Correct Behavior |
|----------|------------------|------------------|
| Trade just opened (< 1 min), tradeMonitor runs | Trade not yet in `openTrades` → Bridge marks closed | Should remain open |

**Root cause:** OANDA propagation lag. Newly created trade may not appear in `getOpenTrades()` for a few seconds.

**Fix:** Add minimum-age guard before marking closed: skip if `Date.now() - openTime < 60_000` ms.

---

### 3.2 getClosedTradeDetails Pagination

| Scenario | Current Behavior | Risk |
|----------|------------------|------|
| >100 transactions in time range | Only first page fetched; close tx may be on page 2+ | `exit_price`, `pnl_dollars` null; `result` = breakeven |

**Root cause:** `pageSize=100`, only first page retrieved.

**Fix:** Loop through all pagination pages until close transaction is found.

---

### 3.3 tradeMonitor Unhandled Rejection

| Scenario | Current Behavior | Risk |
|----------|------------------|------|
| `getOpenTrades()` throws (network) | `runTradeMonitor` rejects; no `.catch` on interval | Unhandled promise rejection; process may exit |

**Fix:** Wrap `runTradeMonitor` in try/catch inside the interval callback.

---

### 3.4 getOpenTrades Returns Empty

| Scenario | Current Behavior | Risk |
|----------|------------------|------|
| OANDA returns `{ trades: [] }` when trades exist | All Bridge "open" trades would be marked closed | Mass false closures |

**Likelihood:** Low (OANDA API quirk). **Mitigation:** Log when `trades.length === 0` but we have open rows; optionally skip close detection in that case.

---

### 3.5 Startup Reconciliation signal_id Bug

**File:** `startupReconciliation.ts` line 16

```ts
signal_id: ot.id  // BUG: ot.id is OANDA trade id ("76"), not a UUID
```

`signal_id` column is `UUID`. OANDA `ot.id` is `"76"` (invalid UUID). Insert will fail.

**Fix:** Use `crypto.randomUUID()` or `gen_random_uuid()` for reconciled rows; do not use `ot.id` as `signal_id`.

---

### 3.6 Concurrency: Order Placement + tradeMonitor

| Scenario | Behavior |
|----------|----------|
| processSignal places order at T; tradeMonitor runs at T+0.5s | Trade may not yet be in OANDA open list → same bug as 3.1. |

**Fix:** Same minimum-age guard as 3.1.

---

### 3.7 Order Placement Failures

| Scenario | Handling |
|----------|----------|
| `placeMarketOrder` throws | Catch block inserts BLOCKED row with OANDA error. ✓ |
| `orderCancelTransaction` (e.g. TAKE_PROFIT_ON_FILL_LOSS) | BLOCKED with friendly message. ✓ |

---

### 3.8 Zero / Invalid Position Size

**File:** `positionSizer.ts` line 69

- `pipDist <= 0` → returns `MIN_UNITS` (1). ✓
- `equity` 0 or negative → `riskAmount` 0 → units could be 0 before `Math.max` → `Math.max(MIN_UNITS, 0)` = 1. ✓
- No max units cap from config (only risk cap). Consider if needed.

---

### 3.9 Heartbeat / Account Failure

- Three consecutive OANDA failures → `sendAlert` ✓
- `cachedAccount` null → risk check blocks ("No cached account summary") ✓
- `getCachedConversionRates()` returns zeros → `positionSizer` uses `FALLBACK_RATES` ✓

---

### 3.10 Circuit Breaker State

- In-memory only; lost on restart.
- `recordClosedTrade` only called from tradeMonitor.
- Cooldown uses `setMinutes` (local time). Timezone edge cases possible.

---

## PART 4: SCENARIO MATRIX (SIMULATION CHECKLIST)

| # | Scenario | Preconditions | Expected | Current |
|---|----------|---------------|----------|---------|
| 1 | New trade, monitor runs within 60s | Trade just opened | Stay open | **Bug:** Can mark closed |
| 2 | TP hit, <100 tx in range | Trade closed by OANDA | Closed with exit/pnl | ✓ |
| 3 | TP hit, >100 tx in range | Trade closed by OANDA | Closed with exit/pnl | **Bug:** exit/pnl may be null |
| 4 | Max hold reached | elapsed >= max_hold | Bridge closes, close_reason='max_hold' | ✓ |
| 5 | getOpenTrades throws | API error | No updates, no crash | **Bug:** Unhandled rejection |
| 6 | Startup with orphan OANDA trade | OANDA has trade not in log | Reconciled row inserted | **Bug:** signal_id invalid |
| 7 | Stale signal (>60s) | created_at old | SKIPPED | ✓ |
| 8 | Duplicate signal (<30s) | Same pair+direction | DEDUPLICATED | ✓ |
| 9 | Opposite position open | LONG open, SHORT signal | BLOCKED | ✓ |
| 10 | Circuit breaker tripped | Drawdown or cooldown | BLOCKED | ✓ |
| 11 | Order rejected (TP on fill loss) | Market past TP at fill | BLOCKED | ✓ |
| 12 | Conversion rate = 0 | Unlisted pair or cache miss | Uses FALLBACK_RATES | ✓ |

---

## PART 5: FILE MAP & RESPONSIBILITIES

| File | Responsibility |
|------|----------------|
| `index.ts` | Startup, intervals, Realtime subscription |
| `connectors/supabase.ts` | Supabase client, Realtime on signals |
| `connectors/oanda.ts` | All OANDA API calls |
| `core/signalRouter.ts` | Full signal pipeline, order placement |
| `core/signalValidation.ts` | Validation, normalization |
| `core/positionSizer.ts` | Unit calculation |
| `core/riskManager.ts` | Risk checks (5 layers) |
| `core/conflictResolver.ts` | Dedup, opposite position |
| `core/circuitBreaker.ts` | Kill switch, drawdown, cooldown |
| `core/correlationChecker.ts` | Same-currency exposure |
| `monitoring/tradeMonitor.ts` | Close detection, max_hold |
| `monitoring/heartbeat.ts` | Account cache, conversion rates |
| `monitoring/alerter.ts` | Webhook alerts |
| `config/bridgeConfig.ts` | Config load |
| `startupReconciliation.ts` | Startup sync |
| `utils/pairs.ts` | Instrument normalization |
| `utils/time.ts` | Market hours |
| `utils/logger.ts` | Logging |

---

## PART 6: FIX PRIORITY

| Priority | Fix | Impact |
|----------|-----|--------|
| P0 | Minimum-age guard in tradeMonitor (60s) | Prevents false closures (confirmed bug) |
| P1 | Pagination in getClosedTradeDetails | Ensures exit_price/pnl populated |
| P1 | try/catch around runTradeMonitor in interval | Prevents process crash |
| P2 | Fix startupReconciliation signal_id (use valid UUID) | Enables orphan reconciliation |
| P3 | (Optional) Skip close detection when getOpenTrades returns empty but we have open rows | Defensive against API anomaly |

---

## PART 7: IMPLEMENTATION CHECKLIST

### Fix P0: Minimum-Age Guard (tradeMonitor)

- [ ] Open `src/monitoring/tradeMonitor.ts`
- [ ] Before the `if (!oandaIds.has(tid))` block (~line 47), add:
  - [ ] `const openedMs = Date.now() - new Date(openTime).getTime();`
  - [ ] `const MIN_OPEN_AGE_MS = 60_000;` (or make configurable)
  - [ ] `if (openedMs < MIN_OPEN_AGE_MS) continue;`
- [ ] Ensure guard applies only to the "not in oandaIds" path (TP/SL inference), not max_hold
- [ ] Add brief comment explaining the guard
- [ ] Manually test: place order, run monitor within 60s, assert status stays `open`

---

### Fix P1a: Pagination in getClosedTradeDetails

- [ ] Open `src/connectors/oanda.ts`
- [ ] Change `getClosedTradeDetails` to:
  - [ ] Follow `pages` from the initial transactions response (not just `pages[0]`)
  - [ ] Or loop: fetch next page via `listJson.pages` until no more pages or close tx found
  - [ ] Search each page's `transactions` for the close
- [ ] Handle case where close tx is never found (return nulls as today)
- [ ] Test with mocked response of 100+ transactions

---

### Fix P1b: tradeMonitor Error Handling

- [ ] Open `src/index.ts`
- [ ] Change the tradeMonitor interval from:
  ```ts
  setInterval(() => runTradeMonitor(supabase, engines), ...)
  ```
  to:
  ```ts
  setInterval(() => {
    void runTradeMonitor(supabase, engines).catch((err) =>
      logWarn('Trade monitor error', { error: String(err) })
    );
  }, config.tradeMonitorIntervalMs ?? 30000);
  ```
- [ ] Ensure `logWarn` is imported
- [ ] Verify process no longer exits on `getOpenTrades` failure

---

### Fix P2: startupReconciliation signal_id

- [ ] Open `src/startupReconciliation.ts`
- [ ] Replace `signal_id: ot.id` with a valid UUID:
  - [ ] Use `crypto.randomUUID()` (Node 19+) or `import { randomUUID } from 'crypto'`
  - [ ] Or use Supabase `gen_random_uuid()` via raw SQL / RPC if preferred
- [ ] Ensure `notes: 'reconciled on startup'` remains for traceability
- [ ] Consider: `engine_id: 'reconciled'` — confirm this does not break engine lookups
- [ ] Test: create orphan trade in OANDA (e.g. manual), restart Bridge, verify row inserted

---

### Fix P3 (Optional): Empty getOpenTrades Guard

- [ ] Open `src/monitoring/tradeMonitor.ts`
- [ ] After `const oandaIds = new Set(...)`:
  - [ ] If `oandaTrades.length === 0` and `logOpen.length > 0`:
    - [ ] Log warning: "OANDA returned 0 open trades but Bridge has N open; skipping close detection this cycle"
    - [ ] `return` early (skip all close updates)
- [ ] Document as defensive measure only

---

## PART 8: TEST PLAN

### Unit Tests

- [ ] `resultFromPnl(null)` → `'breakeven'`
- [ ] `resultFromPnl(0)` → `'breakeven'`
- [ ] `resultFromPnl(1)` → `'win'`, `resultFromPnl(-1)` → `'loss'`
- [ ] `durationMinutes` with invalid dates → null
- [ ] Position sizer: `pipDist <= 0` → MIN_UNITS
- [ ] Position sizer: `conversionRate = 0` → uses FALLBACK_RATES

### Integration Tests (Mock OANDA)

- [ ] `getOpenTrades` returns `[]` for a known open trade → simulate bug scenario
- [ ] `getClosedTradeDetails` returns null when close tx on page 2 → verify pagination fix
- [ ] New trade: run monitor within 60s → assert not marked closed (P0 fix)

### Scenario Tests

- [ ] Place order → run monitor immediately → assert status = `open`
- [ ] Place order → wait 90s → mock trade removed from open list → run monitor → assert status = `closed` with exit/pnl

---

## PART 9: SIGN-OFF

| Phase | Status | Notes |
|-------|--------|-------|
| Audit complete | ✓ | |
| Edge cases documented | ✓ | |
| Fix checklist written | ✓ | |
| P0 implemented | ✓ | 2026-03-12: MIN_OPEN_AGE_MS guard in tradeMonitor.ts |
| P1a implemented | | |
| P1b implemented | | |
| P2 implemented | | |
| P3 implemented (optional) | | |
| Tests added | | |
| Deployed & verified | | |

---

*Document version: 1.0 | Last updated: 2026-03-12*
