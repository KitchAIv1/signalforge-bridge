# Engine Rebuild — Technical Reference
*SignalForge / Veredix | Last updated: May 2026*

## Overview

Engine Rebuild is a GBPUSD M5 compression-breakout scalper. It detects 3-candle patterns where candles 1 and 2 compress (small bodies) and candle 3 breaks out in the trade direction. Target: 1.5R. Stop: 1.0R.

**Current runtime status (queried 2026-05-31):**

| Source | Value |
| --- | --- |
| `bridge_engines.engine_rebuild.is_active` | `true` |
| `bridge_engines.engine_rebuild.max_hold_hours` | `0.5` (30 minutes) |
| `bridge_config.paused_engines` | includes `"engine_rebuild"` |

**Interpretation:** Engine remains active in registry but is **paused for live execution** — signals still write to shadow; bridge blocks new Rebuild orders. Data accumulation / forward-testing mode.

Instrument: GBP_USD (engine signals). Bridge applies Rebuild-specific gates in `signalRouter.ts`.

---

## Architecture Principle

**Frequency and accuracy go hand in hand.**

The engine never reduces signal frequency at the signal source. Every pattern match is recorded in shadow. Intelligence is applied through position sizing, hour/R gates, and execution quality — not signal blocking at the engine layer.

---

## Signal Flow

1. Engine fires signal → writes to `rebuild_shadow_signals` (always)
2. Signal written to `signals` table
3. Bridge receives signal
4. `shouldBlockRebuild` checks hour gate + R bucket gate (+ paused state)
5. If not blocked: wait 5 minutes for bar1 window
6. Fetch real OANDA M1 candles for bar1 window
7. Compute bar1 net R (favorable − adverse)
8. Classify strength → apply size multiplier (**currently all 1.0× — see Bar1 section**)
9. Execute on OANDA with RC2+RC3 corrected SL/TP
10. Log bar1 data to `bridge_trade_log`

---

## Execution Fixes

### RC1 — Reliable TP Placement

`patchTradeTPSL` retries once on failure (500ms delay). CRITICAL log if both attempts fail.

### RC2 — SL Widening

SL widened 1.5 pips from signal SL level after fill. OANDA tick SL vs shadow bar-close gap.

### RC3 — Correct R:R

TP = fillPrice ± (|fillPrice − widenedSL| × 1.5). Guarantees R:R = 1.500.

### RC2 bounds retry fix (commit `f7fdf73`)

`rebuildBoundsRetryOrder.ts`: second attempt on `BOUNDS_VIOLATION` **omits `priceBound`** so RC3 TP math at fill price is not rejected by a stale bound. First attempt uses 2-pip `priceBound`; retry places without bound.

Controlled by `bridge_config.rebuild_bounds_retry` (dashboard toggle).

---

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `REBUILD_DIRECTION_FLIP` | When `'true'`, flips Rebuild signal direction LONG↔SHORT and mirrors SL/TP around entry (`signalRouter.ts`). Applies after Omega direction resolution. |
| `REBUILD_STRUCTURAL_LOGGING` | **[VERIFY — not found in codebase as of 2026-05-31]** |

Bridge config keys (not env): `rebuild_bounds_retry`, `rebuild_hour_gate_enabled`, `paused_engines`.

---

## Hour Gate

Source: `src/core/rebuildHourGate.ts` — `DEFAULT_REBUILD_BLOCKED_HOURS_UTC`:

```
0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 14, 15, 19, 20, 21
```

Blocked when `rebuild_hour_gate_enabled !== false` (default ON).

Dashboard shadow constants (`rebuildShadowConstants.ts`) use a subset `[7, 9, 14, 15, 19]` for filtered analysis — live bridge list is broader.

## R Bucket Gate

Blocked: stop distance **> 7 and ≤ 10 pips** (medium noise band). Allowed: ≤ 7 or > 10 pips.

---

## Bar1 M1 Intelligence Layer

### Status: shadow testing / logging only (not live sizing)

Bar1 fetch and strength classification **run in production** for `engine_rebuild`. Columns populate on `bridge_trade_log`.

**Live multipliers in `signalRouter.ts` (May 2026):**

```typescript
const bar1Multipliers = {
  strong: 1.0, moderate: 1.0, weak: 1.0, against: 1.0, no_data: 1.0,
};
const omegaAlignmentMultiplier = 1.0;
```

All bar1 buckets and Omega alignment currently **1.0×** — bar1 and alignment are logged but do not change unit size. Documented in `ENGINE_AND_SIGNAL_LOGIC.md` as known drift.

### Validated research multipliers (not active in live sizing)

From `docs/engine-rebuild-bar1-layer.md` — 81 real OANDA M1 signals:

| Strength | Bar1 Net R | Research multiplier |
| --- | --- | --- |
| strong | > 0.5R | 2.0× |
| moderate | 0.2–0.5R | 1.0× |
| weak | 0–0.2R | 0.75× |
| against | ≤ 0R | 0.25× |
| no_data | fetch fail | 0.5× |

### Omega direction soft alignment (Rebuild)

**[VERIFY — target matrix not implemented in code]**

Current code: `omegaAlignmentMultiplier = 1.0` always (`signalRouter.ts`).

Design intent (from product spec — not wired): combine bar1 strength with Rebuild-vs-Omega direction alignment into a multiplier range (e.g. strong+aligned 2.5× through against+misaligned 0.375×). Until implemented, alignment is audit-only via log fields `omegaDir`, `rebuildDir`, `alignmentMultiplier`.

Omega **unit** sizing for the Omega engine itself uses `amd_size_multiplier` from AMD — see `ENGINE_AND_SIGNAL_LOGIC.md` Omega section.

---

## Shadow Data

Queried from Supabase `rebuild_shadow_signals` (2026-05-31):

| Metric | Value |
| --- | --- |
| Total signals | 1210 |
| Date range | 2026-04-13 → 2026-05-31 |
| Clean cohort start | **2026-04-13** (first shadow row; filtered analysis references Apr 13–17 week) |

Shadow table: every signal regardless of bridge execution. Used for hour/R gate validation and Phase 4 filtered gates (`REBUILD_FILTERED_MIN_SIGNALS = 150`, etc. in `rebuildShadowConstants.ts`).

---

## Database Tables

### `rebuild_shadow_signals`

Every signal written regardless of execution. Key columns: `signal_time`, `direction`, `entry_price`, `sl_price`, `tp_price`, `r_size_pips`, `outcome_candles`, `final_outcome`, `pnl_r`, `during_news_event`.

### `bridge_trade_log` (engine_rebuild rows)

Executed trades only (blocked when paused). Additional columns: `bar1_net_r`, `bar1_fav_r`, `bar1_adv_r`, `bar1_strength`.

---

## Bridge Crons (Rebuild-related)

Engine Rebuild has **no bridge cron** — signal-driven only.

Related intelligence crons in `src/index.ts` (Omega alignment context only):

| Cron | Function |
| --- | --- |
| `'10 21 * * *'` | Asian direction set |
| `'0 8 * * *'` | Asian session close |
| `'31 10 * * *'` | AMD detection |
| `'30 16 * * *'` | AMD outcome |

---

## Commit History (Key Changes)

| Commit | Change |
| --- | --- |
| `f7fdf73` | Bounds retry: omit priceBound on second attempt (RC2 R:R at fill) |
| `6f1a851` | RC1+RC2+RC3 fixes, hour blocks, dynamic cap |
| `e28c75f` | Bar1 M1 strength layer, migration 008 columns |

---

## Pending / Known Gaps

- Rebuild paused in `paused_engines` — remove from pause list to resume live execution.
- Bar1 multipliers at 1.0× — enable research multipliers after 50+ live trades validate buckets.
- Omega alignment multiplier table not implemented — `omegaAlignmentMultiplier` hardcoded 1.0.
- `REBUILD_STRUCTURAL_LOGGING` env var referenced in spec but not found in code [VERIFY].

---

*Engine Rebuild Reference | SignalForge / Veredix | May 2026*
