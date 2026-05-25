# Veredix Platform Map

Canonical snapshot of live runtime behavior, resolved issues, and remaining open work. Updated May 24, 2026.

## System Layers

| Layer | Location | Role |
| --- | --- | --- |
| External engines | Outside this repo | Insert trade intent into Supabase `signals` |
| Bridge runtime | `src/` | Validate, gate, size, execute, monitor, reconcile |
| OANDA connector | `src/connectors/oanda.ts` | Practice/live broker API (only production broker today) |
| Intelligence crons | AMD 10:31 UTC, Regime H4+5m, Asian 21:00/08:00 UTC | Write `amd_state`, `regime_state`, direction automation |
| Dashboard | `dashboard/` | Ops console, Intelligence page, engine controls |
| Research scripts | `scripts/` | Backtests, replays, one-off fixes (not runtime) |

## Live AMD Tags (Production Only)

`resolveAmdTag()` in `src/services/amdDetector/amdFeatures.ts` produces exactly six tags:

| Tag | Meaning |
| --- | --- |
| `INSUFFICIENT_DATA` | Asian range not yet available |
| `AMD_TEXTBOOK` | Tight flat Asian, confirmed reversal, Judas ≥ 8 pips |
| `AMD_COMPRESSION_BREAKOUT` | Tight flat Asian, compression breakout, no reversal required |
| `AMD_FAILED` | Tight flat Asian, structure failed |
| `AMD_SHIFTED` | Tight Asian but not flat, or range 35–50 pips |
| `AMD_NONE` | Wide Asian range (≥ 50 pips) |

**Not live:** `AMD_PARTIAL` and `AMD_DELAYED` exist only in backtest scripts (`scripts/amdBackfillFeatures.ts`). Do not list them as production tags.

## OANDA Trade Close & Reconciliation (May 2026)

| Function | Behavior |
| --- | --- |
| `getTradeById()` | `GET /v3/accounts/{id}/trades/{id}` — direct lookup by trade ID, returns `state`, `closeTime`, `averageClosePrice`, `realizedPL` |
| `getClosedTradeDetails()` | Strategy 1: `getTradeById` when closed. Strategy 2: transactions API fallback (original) |
| `runStartupReconciliation()` | Forward: OANDA open missing in bridge → insert. **Reverse:** bridge open but not in OANDA → close via `getTradeById`, `close_reason=reconciled_on_startup` |
| `scripts/fixNullPnlTrades.ts` | One-time retroactive fix for null `pnl_dollars` rows (run manually) |

P&L derivation uses `computeDerivedFields` from `tradeMonitorHelpers.ts` (`fill_price`, `stop_loss`, `units`, `pair`) — same as `tradeMonitor.ts`.

**Retroactive fix result (May 24, 2026):** 17 rows corrected from OANDA; 19 skipped (404 — practice account history purged). ~20 remaining null P&L rows are permanently unrecoverable.

## Omega SL Mirror (Trail Sizing)

Unconditional mirror at fill for Omega only (`signalRouter.ts` ~914–945). Anchors `bridge_trade_log.stop_loss` to `fillPrice ± signalRSize` for trail math when direction may have been flipped by `resolveOmegaDirection()`.

Motivating incident: Trade 1108 — instant `trail_sl_hit` at 12s when wrong-side SL produced `rSizeRaw≈0`. **Working as designed.** Not an open bug.

## Telegram Alerts (May 2026)

| Alert | Trigger |
| --- | --- |
| Daily AMD tag | 10:31 UTC AMD cron |
| Auto direction set | `applyAutoDirectionToBridgeConfig` when `direction_mode=auto` |
| Trade executed | OANDA fill in `signalRouter` |
| Asian open / close | `AsianDirectionService` direction set and session close |
| Circuit breaker | Consecutive-loss cooldown entry |

Shared client: `src/services/telegram/telegramClient.ts`.

## Known Issues & Resolution Status

| Item | Status | Notes |
| --- | --- | --- |
| AMD_COMPRESSION_BREAKOUT exit hour | ✅ **Resolved** | Hard exit 13→14 UTC (`f21dc88`) |
| AMD_NONE direction rule | ✅ **Resolved** | Judas fallback / D1 tier logic in `amdAutoDirection.ts` |
| SL mirror block | ✅ **Resolved** | Not a bug — Trade 1108 fix, fill-price anchoring stable |
| AsianDirectionService weekend | ✅ **Resolved** | Sunday/Saturday → Friday amd_state lookup (`f9f6b26`) |
| getClosedTradeDetails silent failure | ✅ **Resolved** | `getTradeById` strategy 1 + transactions fallback (`f1ae22b`) |
| Bridge startup reconciliation | ✅ **Resolved** | Reverse ghost-open check on startup (`f1ae22b`) |
| AMD_NONE trail activation delay | ⏳ **Pending spec** | Trail threshold behavior for AMD_NONE days not yet specified |
| reversal_confirmed modifier | 📋 **Deprioritized** | Future note — TEXTBOOK/FAILED only; no action planned |

## Open Work (Honest List)

Only items above marked Pending or Deprioritized, plus:

- **Security:** Dashboard has no auth; anon RLS for browser reads/writes
- **Broker abstraction:** VT Markets path not started; OANDA-only runtime
- **Deduplication:** Disabled in code since 2026-04-08
- **Rebuild bar1 sizing:** Logged but multipliers neutral at 1.0
- **20 irrecoverable null P&L rows:** Practice account purged old trade IDs; acceptable permanent gap

## Key Commits (Recent)

| Commit | Change |
| --- | --- |
| `f1ae22b` | Trade reconciliation: `getTradeById`, reverse startup reconcile, fix script |
| `8292658` | Telegram alert system (5 new alerts + AMD_PARTIAL/DELAYED display fix in maps only) |
| `c81332a` | Activity page: Regime + Asian side-by-side layout |
| `f21dc88` | AMD_COMPRESSION_BREAKOUT exit hour 14 UTC |
| `f9f6b26` | AsianDirection weekend amd_state fallback |

## Related Docs

- [System Architecture](./SYSTEM_ARCHITECTURE.md) — startup order, signal flow
- [Bridge And Brokers](./BRIDGE_AND_BROKERS.md) — OANDA methods, trade monitor
- [Engine And Signal Logic](./ENGINE_AND_SIGNAL_LOGIC.md) — Omega, AMD, Rebuild
- [Roadmap](./ROADMAP.md) — planned work not yet shipped
