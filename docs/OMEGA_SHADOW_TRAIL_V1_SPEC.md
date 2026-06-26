# Omega Shadow Trail v1 — Build Spec

**SignalForge / Veredix | 2026-06-24**
**Status:** Implemented (migration 049 + resolver cron + dashboard)

---

## Purpose

Side-by-side monitor: **live Omega Trail v1 PnL** vs **shadow Trail v1 exit** on the **same signals**. No OANDA orders — dashboard + Supabase only.

Ground-truth backtests: SIGNALFORGE `engine-omega/output/backtest_w5c0_trail_v1_jun16_jun23.txt`

---

## Trail v1 exit (shadow only)

| Parameter | Value |
|-----------|-------|
| Orders | **One** (no ratchet split) |
| Initial SL | **1.5R** (structure stop from signal) |
| Trail distance | **0.5R** |
| Activation | **0R** (immediate) |
| Execution cost | **1.2p** RT (0.4 half-spread + 0.2 slippage × 2) |

---

## Signal + filter (must match before shadow sim)

| Layer | Rule |
|-------|------|
| Engine | `omega` — tp1 leg in `bridge_trade_log` |
| Pattern | w5/c0 live signals (already filtered at emit) |
| r floor | ≥ 4p (bridge validation) |
| **Asian window** | **00:00–08:00 UTC** — direction = `bridge_config.omega_direction` during Asian session |
| **Distribution window** | **10:31–16:00 UTC** — direction **ungated** (DTW as fired); `valid_until` **16:00 UTC** |

Signals outside windows → `filter_passed=false`, no shadow PnL.

---

## Shadow lanes (both stored per row)

| Lane | Column | Meaning |
|------|--------|---------|
| **Ungated (baseline)** | `shadow_pips_net` | SL **1.5R** both directions |
| **Sequenced (baseline)** | `sequenced_pips_net`, `sequenced_status` | One-at-a-time gate on baseline exit bars |
| **Ungated (optimized)** | `shadow_opt_pips_net`, `shadow_opt_sl_r` | SL **SHORT 2.0R / LONG 3.0R** (migration 050) |
| **Sequenced (optimized)** | `sequenced_opt_pips_net`, `sequenced_opt_status` | One-at-a-time gate on optimized exit bars |

Baseline columns unchanged for backward compatibility.

---

## Data model

**Table:** `omega_shadow_trail_exit` (migrations `049` + `050`)

**Source rows:** `bridge_trade_log` where `engine_id='omega'`, primary leg (`leg_type` null / tp1 / primary), `status IN ('open','closed')`

**Unique key:** `signal_id`

---

## Resolver

**Service:** `src/services/shadowTrailExit/shadowTrailExitService.ts`

**Schedule:** Cron `*/5 * * * *` UTC in `src/index.ts`

**Steps:**
1. Load primary omega legs without shadow row
2. Classify window (asian / dist_loose)
3. Load expected direction (omega_direction or decision_auto_direction)
4. Fetch M5 via `fetchCandleRange()` from entry → +48h
5. Bar-walk trail v1 → `shadow_pips_net`
6. Batch sequenced gate on filtered signals (chronological)
7. Aggregate live leg PnL per `signal_id` → `live_pnl_pips`
8. Upsert `omega_shadow_trail_exit`

---

## Dashboard

**Route:** `/omega-shadow-trail`

**Panels:**
- Today summary: live net vs shadow ungated vs shadow sequenced
- Compare table: per signal with filter reason, both shadow lanes, live result

**Poll:** 30s (same pattern as `/omega-inverse`)

---

## Acceptance (Jun 16–23 replay)

Re-run resolver on historical tp1 rows; totals should approximate:

| Lane | Target |
|------|--------|
| Ungated filtered | ~+587p, ~86% win, ~142 rows |
| Sequenced executed | ~+115p, ~22 executed, ~120 blocked |

Tolerance: ±5% (M5 bar alignment, entry price vs backtest).

---

## Files

| Path | Role |
|------|------|
| `migrations/049_omega_shadow_trail_exit.sql` | Table |
| `migrations/050_omega_shadow_trail_exit_opt.sql` | Optimized SL columns |
| `src/services/shadowTrailExit/*` | Resolver |
| `src/index.ts` | Cron hook |
| `dashboard/app/(dashboard)/omega-shadow-trail/page.tsx` | UI |
| `dashboard/lib/fetchShadowTrailData.ts` | Data fetch |

---

## Out of scope (v1)

- OANDA netting stack model (lane C)
- M1 intrabar resolution
- Auto-switch live exit to trail v1

---

*Spec | SignalForge Bridge | 2026-06-24*
