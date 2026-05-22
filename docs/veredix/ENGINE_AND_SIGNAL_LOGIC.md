# Engine And Signal Logic

## Engine Contract

Engines insert trade intent into the shared Supabase `signals` table. The bridge consumes the insert and normalizes the payload in `src/core/signalValidation.ts`. Required concepts include:

- `engine_id`
- `pair`
- `direction`
- entry zone or entry price
- stop loss
- take profit or enough data for default R:R fallback
- confluence score
- optional `stop_loss_pips`

The bridge never treats engine signals as automatic orders. Every signal passes through runtime controls, risk checks, engine-specific logic, position sizing, and broker execution.

## Engine Catalog

| Engine | Status In Repo | Notes |
| --- | --- | --- |
| `alpha` | Seeded legacy engine | Standard bridge pipeline. |
| `charlie` | Seeded legacy engine | Can participate in trail-stop logic when enabled. |
| `charlie_shadow` | Referenced in runtime/docs | Trail-stop-capable; engine-side shadow status. |
| `delta` | Seeded legacy engine | Standard bridge pipeline. |
| `falcon` | Seeded by migration 006 | Dashboard controls include pause/resume. |
| `omega` | Runtime-specialized | Direction override, AMD/regime audit, news sizing, trail-stop path, candle capture. |
| `engine_rebuild` | Runtime-specialized | GBP_USD M5 scalper with hour/R gates, bar1 capture, bounds retry, and RC fixes. |
| `sigma` | Dashboard control row only | Appears in controls; seed/runtime status should be confirmed. |

## General Pipeline

1. Check stale signal age.
2. Validate and normalize the payload.
3. Check processing latency.
4. Read live control keys: paused engines, Omega direction, Rebuild retry, Rebuild hour gate, and direction mode.
5. Confirm engine is registered and active.
6. Enforce dashboard engine pause.
7. Run circuit breaker checks.
8. Check open opposite positions for non-Omega engines.
9. Count same-pair and correlated exposure.
10. Apply Rebuild-specific gates before risk checks.
11. Run risk checks.
12. Apply news, Omega, AMD, regime, or Rebuild-specific logic.
13. Calculate units.
14. Place OANDA order.
15. Insert or update `bridge_trade_log`.

## Risk Checks

`src/core/riskManager.ts` currently enforces:

- Stop loss is present.
- Risk:reward ratio is above `min_risk_reward_ratio` when supplied.
- Confluence score meets the engine execution threshold.
- Engine daily trade count is below `max_daily_trades`.
- Global daily trade count is below 500.
- Non-Omega same-pair positions are below `max_per_pair_positions`.
- Non-Omega same-currency exposure is below `max_correlated_exposure`.
- Cached OANDA account summary exists.
- Forex market is open with configured weekend buffer.

The circuit breaker also blocks on kill switch, drawdown, consecutive losses, and cooldown.

## Position Sizing

`src/core/positionSizer.ts` calculates:

```text
units = floor((equity * engineWeight * effectiveRisk) / (slPips * pipValueUsd))
```

The effective risk:

- Starts from `risk_per_trade_pct`.
- Is cut by 50% after `graduated_response_threshold` consecutive losses.
- Gets a 15% boost for confluence score >= 85.
- Gets a 15% reduction for confluence score < 75.
- Is hard-capped at 3%.

If an engine sends `stop_loss_pips`, that value is preferred over deriving pip distance from price.

## Omega Logic

Omega has the richest live control surface:

- `omega_direction` comes from `bridge_config`, with env fallback `OMEGA_DIRECTION_OVERRIDE`.
- `direction_mode` is `manual` or `auto`.
- `resolveOmegaDirection()` flips the execution direction when `omega_direction=short`.
- When the stored Omega direction changes, bridge attempts to close opposing open Omega positions.
- The bridge blocks new Omega signals if opposing Omega legs remain open, preventing OANDA netting issues.
- Regime state is fetched for AUD_USD and persisted as audit fields on Omega trade rows.
- AMD state is fetched for AUD_USD and persisted as audit fields on Omega trade rows.
- `amd_size_multiplier` can scale Omega units when present.
- News intelligence can increase or reduce Omega units depending on event window behavior.
- Omega uses trail-stop handling instead of sending a normal SL to OANDA.
- Pre-entry M5 and H1 candles are captured after fill with a three-second timeout.

## AMD Influence

AMD detection runs daily at 10:31 UTC and writes `amd_state`. The service computes Asian range, Judas direction, reversal status, AMD tag, D1 bias, auto direction, confidence, reason, and size multiplier.

Important nuance: older comments call AMD advisory/logging only, but current bridge code applies `amd_size_multiplier` to Omega units and records `direction_source`. When `direction_mode=auto`, AMD can update `omega_direction` through its auto-direction path.

## Regime Influence

Regime detection runs at H4 candle close plus five minutes and writes `regime_state`. It uses D1 and H4 candles for layers 4-6 and applies a layer 7 weekly-open override when applicable.

Current execution impact is audit-oriented for Omega:

- Latest regime state is fetched.
- A regime size multiplier is computed.
- Direction, confidence, evaluated time, layer results, and choppy/weekly-open fields are persisted on Omega trade rows.

The docs should treat regime as advisory unless a future change explicitly gates or resizes all Omega orders from regime.

## Engine Rebuild Logic

Engine Rebuild is a GBP_USD M5 compression-breakout scalper documented as a 30-minute max-hold, 1.5R target strategy. In bridge runtime it has special handling:

- Hour gate can block bad UTC hours when `rebuild_hour_gate_enabled=true`.
- R bucket gate blocks stop distances from 7 to 10 pips.
- Optional `REBUILD_DIRECTION_FLIP=true` flips Rebuild direction and mirrors SL/TP around entry.
- Bar1 waits for the first five-minute window after the signal, fetches five OANDA M1 candles, and logs strength.
- Dynamic cap limits Rebuild units based on equity, a 50% margin budget, four-position split, and approximate GBP_USD price.
- Bounds retry places the first order with a 2-pip `priceBound` and can retry once without it on `BOUNDS_VIOLATION`.
- RC2 widens SL by 1.5 pips after fill.
- RC3 computes TP from actual fill-to-widened-SL risk at 1.5R.
- RC1 retry logic lives in `patchTradeTPSL`.

Known drift: live bar1 multipliers are all set to 1.0, so bar1 strength is currently logged but does not change Rebuild unit size.

## News Logic

News handling applies to Omega and Engine Rebuild when `news_blackout_enabled=true`. A news window can block, reduce, or exploit depending on event state. The bridge logs news decisions and uses event direction context for Omega.

## Shadow Versus Live

Shadow tables record research or engine-side outcomes, often regardless of whether bridge executes. Live bridge execution may block a signal due to controls, risk, gates, OANDA rejection, or safety checks.

This distinction matters most for Rebuild, where `rebuild_shadow_signals` can include every pattern while bridge live rows only include signals that pass runtime controls.

## Known Gaps

- Engine runtime source is incomplete in this repository.
- Shadow table schemas are referenced but not created by the main migration set.
- Sigma appears in dashboard controls but lacks a clear migration seed in the explored files.
- Deduplication is documented historically but currently disabled in code.
