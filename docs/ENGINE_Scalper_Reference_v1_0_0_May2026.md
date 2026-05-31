# Engine Scalper — Technical Reference v1.0.0

**SignalForge / Veredix | May 2026**
**Instrument:** AUD_USD | **Session:** Distribution (10:00–16:00 UTC)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial reference doc created |
| 2026-05-31 | `isAgree()` extended to arm on `asian_close_bias_signal = 'NEUTRAL'` (commit `15b77b7`) |

---

## 1. Purpose

The Scalper engine runs a **price-ratchet pullback** strategy on AUD_USD during the distribution session. It enters on a fixed pullback from the 10:00 UTC M5 reference close, takes fixed TP/SL per trade, ratchets the reference when TP is confirmed on OANDA, and hard-closes all open positions at 16:00 UTC.

It operates **in parallel** with the AMD Distribution engine — separate OANDA orders, separate DB tables (`scalper_day_state`, `scalper_trades`), mirrored to `bridge_trade_log` on close.

---

## 2. Architecture

```
amd_state (10:31 UTC)
       │
       ▼
initializeDayState() ──► scalper_day_state (reference, trigger, ratchet_count)
       │
       ▼
runMonitors() every 30s
  ├── runExitMonitor()  ──► OANDA getTradeById, ratchet, circuit breaker
  └── runEntryMonitor() ──► OANDA placeMarketOrder
       │
       ▼
hardClose() at 16:00 UTC ──► closeTrade(), stop_day
```

### Reads

| Source | Fields used |
|--------|-------------|
| `amd_state` | `auto_direction`, `asian_close_bias_signal`, `amd_tag` |
| OANDA | M5 10:00 candle (init), live pricing (entry), trade status (exit) |
| `news_events` | ±90 min blackout check |
| `bridge_config` / account | Balance for position sizing |
| Env vars | See §6 |

### Writes

| Target | When |
|--------|------|
| `scalper_day_state` | Init, ratchet, stop |
| `scalper_trades` | Open, close |
| `bridge_trade_log` | On trade close via `scalperBridgeSync.ts` |
| OANDA | Market orders with TP/SL attached |

### Triggers (registered in `src/index.ts`, gated on `SCALPER_ENABLED=true`)

| Schedule | Function |
|----------|----------|
| `32 10 * * 1-5` UTC | `initializeDayState()` |
| `37 10 * * 1-5` UTC | `initializeDayState()` retry |
| `42 10 * * 1-5` UTC | `initializeDayState()` retry |
| Every 30 seconds | `runMonitors()` |
| `0 16 * * 1-5` UTC | `hardClose()` |

AMD detector runs at `31 10 * * *` — first viable init is 10:32 UTC.

---

## 3. Intelligence Layers (gate order)

Applied in `initializeDayState()` before any trade:

| Order | Gate | Pass condition | On fail |
|-------|------|----------------|---------|
| 1 | `SCALPER_ENABLED` | env = `'true'` | No-op |
| 2 | DB idempotency | No existing `scalper_day_state` row today | Skip |
| 3 | AMD state ready | `amd_state.auto_direction` present | Retry until 10:16; then `amd_not_ready` |
| 4 | Direction gate (`isAgree`) | See §3.1 | `stop_reason: no_agree` |
| 5 | Reference candle | 10:00 UTC M5 close from OANDA | Abort init (no row) |

### 3.1 Direction gate — `isAgree()`

Source: `src/services/scalper/ScalperEngine.ts`

| `asian_close_bias_signal` | `auto_direction` | Result |
|---------------------------|-------------------|--------|
| `BULLISH` | `long` | **ARM** |
| `BEARISH` | `short` | **ARM** |
| `NEUTRAL` | `long` or `short` | **ARM** (added 2026-05-31) |
| `BULLISH` | `short` | BLOCK (`no_agree`) |
| `BEARISH` | `long` | BLOCK (`no_agree`) |
| any | neutral / null | BLOCK |

**Note:** AGREE-only backtests (`loadAgreeDirectionalCohort.ts`) do **not** include NEUTRAL days. Live engine post-`15b77b7` does.

Additional runtime gates in `runEntryMonitor()`:
- Trigger window: 10:05–15:55 UTC
- `day_stopped = false`
- `ratchet_count < SCALPER_MAX_RATCHETS`
- 5-minute bar guard (one open per M5 bar)
- News blackout ±90 min

`amd_outcome_tag` is **never** referenced (Iron Law 7).

---

## 4. Entry Logic

Source: `scalperEntryMonitor.ts`

1. **Reference price:** 10:00 UTC M5 bar close (set at init).
2. **Trigger level:** `reference ± SCALPER_PULLBACK_PIPS × 0.0001` (long: subtract, short: add).
3. **Trigger check:** Live mid-price `(bid + ask) / 2` crosses trigger level.
4. **Entry:** OANDA market order; fill price recorded (not necessarily exact trigger).
5. **TP/SL on order:** `trigger_level ± tp/sl pips` sent to OANDA.

Trigger window enforcement:

```typescript
const afterOpen = h > 10 || (h === 10 && m >= 5);
const beforeCutoff = h < 15 || (h === 15 && m <= 55);
```

---

## 5. Exit Logic

Source: `scalperExitMonitor.ts`, `ScalperEngine.hardClose()`

| Event | Behavior | Accounting (`pnl_pips`) |
|-------|----------|-------------------------|
| TP hit (OANDA close ≥ tp_price for long) | Win; ratchet reference to `tp_price` | `+SCALPER_TP_PIPS` |
| SL hit | Loss; circuit breaker force-closes all other open trades | `-SCALPER_SL_PIPS` |
| Circuit breaker (other trades) | Force close at market | `0` (force_flat) |
| Max ratchets reached | `day_stopped`, `stop_reason: max_ratchets` | — |
| 16:00 hard close | Close all open at fill price | Actual signed pips |

**Iron Law 3:** One SL stops the entire day.
**Iron Law 5:** Reference ratchets forward only (long: higher TP prices; short: lower).
**Iron Law 6:** Hard close at 16:00 regardless of P&L.

Ratchet fires on **OANDA close confirmation**, not price touch (live deviation from backtest noted in code comment).

---

## 6. Parameters

| Env var | Default | Purpose |
|---------|---------|---------|
| `SCALPER_ENABLED` | unset (off) | Master switch; must be `'true'` |
| `SCALPER_PULLBACK_PIPS` | `5` | Pullback from reference to trigger |
| `SCALPER_TP_PIPS` | `10` | Take profit per trade |
| `SCALPER_SL_PIPS` | `10` | Stop loss per trade |
| `SCALPER_MAX_RATCHETS` | `3` | Max ratchet count per day |
| `SCALPER_RISK_PCT` | `0.01` | Fraction of balance risked per trade |
| `SCALPER_PAIR` | `AUD_USD` | OANDA instrument |

Pip conversion: `pips × 0.0001` (`pipsToPrice()` in `scalperTypes.ts`).

---

## 7. Key Tables

Migration: `migrations/027_scalper.sql`

### `scalper_day_state`

One row per `(trade_date, pair)`. Tracks daily state.

| Column | Purpose |
|--------|---------|
| `direction` | `long` / `short` |
| `amd_tag` | From `amd_state` at init |
| `reference_price` | Current ratchet reference (10:00 close initially) |
| `trigger_level` | Next entry trigger |
| `ratchet_count` | TP-confirmed ratchets today |
| `day_stopped` | No further entries when true |
| `stop_reason` | `sl`, `max_ratchets`, `hard_close`, `no_trigger`, `no_agree`, `amd_not_ready` |
| `net_pips_day` | Sum of accounting P&L |

### `scalper_trades`

One row per trade. `result = NULL` while open on OANDA.

| Column | Purpose |
|--------|---------|
| `pnl_pips` | Accounting P&L (force_flat = 0) |
| `pnl_pips_actual` | Fill-to-fill signed pips |
| `result` | `win`, `loss`, `force_flat`, `force_flat_failed`, `timeout_16h` |
| `ratchet_index` | Which ratchet level (1–3) |

---

## 8. Performance (backtest reference)

Production config: pullback=5, tp=10, sl=10, max_ratchets=3, window 10:05–16:00, AGREE cohort.

See [BACKTEST_ScalperValidation_May2026.md](./BACKTEST_ScalperValidation_May2026.md) for CSV-sourced numbers.

Source row: `scripts/output/scalper_extended_window_grid.csv`, Run B:
- 124 days, 269 trades, 73.3% win, +1054.6 net pips, +3.92 expectancy/trade

Contamination audit performed on `simulatePriceRatchetDay.ts` and `distributionNoGateBacktest.ts` (May 2026) — all 14 checks passed.

---

## 9. Known Limitations

- Entry trigger uses **live mid-price**; backtest uses **bar low/high** — execution deviation expected.
- Ratchet in live fires on OANDA close, not TP touch — documented as negligible (<1 bar).
- No `amd_outcome_tag` — cannot backtest-filter on post-hoc tag accuracy in live gate.
- Single pair (`AUD_USD`) only.
- Disabled when `SCALPER_ENABLED !== 'true'`.

---

## 10. Key Source Files

| File | Role |
|------|------|
| `src/services/scalper/ScalperEngine.ts` | Cron orchestrator, init, hard close, `isAgree()` |
| `src/services/scalper/scalperEntryMonitor.ts` | Trigger check, OANDA entry |
| `src/services/scalper/scalperExitMonitor.ts` | Exit, ratchet, circuit breaker |
| `src/services/scalper/scalperDayState.ts` | DB helpers |
| `src/services/scalper/scalperTypes.ts` | Types, config loader |
| `src/services/scalper/scalperBridgeSync.ts` | Mirror to `bridge_trade_log` |
| `scripts/scalperBacktest/simulatePriceRatchetDay.ts` | Backtest simulation (shared logic) |

---

*Engine Scalper Reference v1.0.0 | SignalForge / Veredix | May 2026*
