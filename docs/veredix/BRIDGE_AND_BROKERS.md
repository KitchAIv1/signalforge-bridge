# Bridge And Brokers

## Bridge Responsibility

The bridge is the live execution layer. It consumes normalized signals, decides whether they are allowed to execute, calculates units, submits orders to the broker, monitors open trades, and writes the audit trail.

The bridge does not:

- Generate engine signals.
- Store broker secrets in Supabase.
- Route live orders to multiple brokers today.
- Manage dashboard authentication.

## OANDA Runtime Integration

`src/connectors/oanda.ts` is the only production broker connector currently used by runtime execution. It selects the base URL from `OANDA_ENVIRONMENT`:

- `practice`: `https://api-fxpractice.oanda.com`
- `live`: `https://api-fxtrade.oanda.com`

Credentials come from:

- `OANDA_API_TOKEN`
- `OANDA_ACCOUNT_ID`

## OANDA Methods

| Method | Purpose |
| --- | --- |
| `getAccountSummary()` | Startup, heartbeat, account cache, sizing equity. |
| `getOpenTrades()` | Trade monitor reconciliation and open-trade sync. |
| `getPricing()` | Connection tests and pricing checks. |
| `placeMarketOrder()` | FOK market order with optional price bound, SL on fill, and TP on fill. |
| `patchTradeTPSL()` | Rebuild RC1 TP/SL patch with retry. |
| `closeTrade()` | Max-hold, trail stop, and Omega flip closes. |
| `getTradeById()` | Direct single-trade lookup by OANDA trade ID; returns state, close time, average close price, and realized P&L. |
| `getClosedTradeDetails()` | Close lookup after OANDA no longer reports a trade as open. Tries `getTradeById` first, then transactions API fallback. |
| `fetchLatestM5Candle()` | AMD/regime helpers. |
| `fetchCompletedCandles()` | Regime, AMD, pre-entry, close-candle, and research helpers. |

## Order Lifecycle

1. `signalRouter.ts` calculates `finalUnits`.
2. OANDA market order is submitted using FOK time-in-force.
3. For Rebuild, the first order may include a 2-pip `priceBound`.
4. If Rebuild gets `BOUNDS_VIOLATION` and retry is enabled, bridge retries once without the price bound.
5. OANDA fill or cancel response determines the bridge decision.
6. Fill rows include OANDA order ID, trade ID, units, fill price, status, and engine-specific audit columns.
7. OANDA cancel rows are logged as `BLOCKED`.

## TP And SL Behavior

| Engine Type | OANDA SL/TP Behavior |
| --- | --- |
| Standard engines | SL and TP can be sent on fill based on normalized signal prices. |
| Omega | Uses trail-stop path; SL is mirrored in `bridge_trade_log` for trail math, not sent as a normal OANDA SL. |
| Engine Rebuild | Applies post-fill RC2 widened SL and RC3 corrected TP through `patchTradeTPSL()`. |

## Trade Monitor

`src/monitoring/tradeMonitor.ts` runs every configured interval, default 30 seconds.

It:

- Fetches OANDA open trades.
- Skips close inference for trades younger than 60 seconds to avoid OANDA propagation lag.
- Marks absent older trades as closed after fetching transaction close details.
- Force-closes trades that exceed engine `max_hold_hours`.
- Writes exit price, dollars, pips, R, result, close reason, closed time, and duration.
- Runs trail-stop checks for configured trail engines.
- Captures additional close candles for Omega.
- Exits the process after five consecutive OANDA monitor failures so the process manager can restart it.

## Heartbeat

Heartbeat runs every configured interval, default 30 seconds. It fetches account summary, connection state, conversion rates, and writes health data. Dashboard account snapshot panels depend on the shape of `bridge_health_log.details`, not direct OANDA calls.

## Broker Schema Today

The schema already contains broker-routing concepts:

- `bridge_brokers`
- `bridge_links`
- `broker_id` on `bridge_trade_log`
- `capital_allocation_pct`
- `broker_type`
- `api_base_url`
- `connection_status`

Runtime execution does not yet use these tables to choose a broker. The bridge imports the OANDA connector directly and logs `broker_id` from execution behavior rather than dynamic routing.

## VT Markets Future Path

VT Markets support should be treated as a broker abstraction project, not a small connector swap. Required work:

1. Define a `BrokerClient` interface covering account summary, open trades, pricing, market order, TP/SL patch, close trade, closed-trade details, and candle fetches.
2. Wrap OANDA behind that interface without changing existing behavior.
3. Add a VT Markets implementation.
4. Move runtime broker selection from direct imports to routing via `bridge_links`.
5. Define credential storage and secret management for each broker.
6. Add per-broker health checks and dashboard status.
7. Add contract tests against fake broker responses.
8. Define differences in order semantics, netting, SL/TP placement, price bounds, fill policies, and instrument naming.

## Broker Abstraction Interface Sketch

```ts
export interface BrokerClient {
  getAccountSummary(): Promise<AccountSummary>;
  getOpenTrades(): Promise<OpenTrade[]>;
  getPricing(instruments: string): Promise<PriceQuote[]>;
  placeMarketOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>;
  patchTradeTPSL(tradeId: string, takeProfit: string, stopLoss: string): Promise<void>;
  closeTrade(tradeId: string, units?: string): Promise<CloseTradeResult>;
  getTradeById(tradeId: string): Promise<TradeByIdDetails | null>;
  getClosedTradeDetails(tradeId: string, fromTime: string): Promise<ClosedTradeDetails>;
  fetchCompletedCandles(instrument: string, granularity: string, fromISO: string, toISO: string): Promise<unknown[]>;
}
```

## Safety Requirements For New Brokers

- Never change OANDA behavior while introducing another broker.
- Do not store raw broker secrets in browser-readable tables.
- Model broker-specific order cancellation reasons.
- Record broker ID and broker type on every trade row.
- Preserve max-hold, circuit breaker, engine pause, and kill switch behavior.
- Confirm netting/hedging behavior before allowing Omega direction flips.
- Confirm pip, unit, lot, and margin semantics before reusing position sizing.

## Startup Reconciliation

`src/startupReconciliation.ts` runs once at bridge startup (step 7 in `src/index.ts`):

1. **Forward:** OANDA open trades missing from `bridge_trade_log` → insert reconciled open row.
2. **Reverse:** Bridge rows still `status='open'` but absent from OANDA open set → `getTradeById()` → if `CLOSED`, update row with exit price, P&L, `pnl_r`, and `close_reason=reconciled_on_startup`.
3. **Dedup:** Pre-populate conflict resolver from last 60 seconds of executed trades.

Reverse reconciliation closes ghost open rows after Railway restarts when the bridge was down during trade close.

## Known Gaps

- OANDA env example files must be sanitized if they contain real-looking values.
- `bridge_brokers.api_token_encrypted` exists but runtime intentionally reads env vars.
- Health page reads broker status, but only OANDA practice is practically supported today.
- There is no broker-level failover or split allocation runtime.
