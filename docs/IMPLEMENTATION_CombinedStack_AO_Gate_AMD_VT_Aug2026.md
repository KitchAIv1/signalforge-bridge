# Combined Stack — AO AMD-Day Gate + AMD Engine on VT + Master Switch

**Implemented:** Aug 4, 2026 · **Migration:** `073_combined_stack.sql` · **Everything ships OFF / inactive.**

## Why

45-day causal counterfactual (validated Aug 2026, no look-ahead):

| Book | Actual | With new logic |
| --- | --- | --- |
| AO (with AMD-failed-day gate) | −98.3p | +3.3p (fills-only view; +34.6p incl. sizing view) |
| AMD (with 072 exit stack) | −6.1p | +74.0p |
| **Combined** | **−104.4p** | **+108.6p** |

The AO gate removed 30 of 77 fills; removed fills were 25% winners vs 39% baseline.

## Original setup (before this change)

**AlphaOmega (engine `omega`, Lane B):**

- Brokers: `oanda_phase2_demo` (OANDA demo) + `vtmarkets_ao_live` (VT Markets MT5 live via MetaApi, magic **88004**). Same code path fans out to both.
- Entry: 7-crack streak gate + speed floor + 21:00–21:15 UTC blackout + toxic-crack skip (070, kill-switched).
- Exits: opposing-fire count (5) / share, hard stop 10p, giveback trail, backstop crack, dead-crack abort (071, kill-switched).
- Sizing: `sizeAlphaOmegaPureUnits` (pure signal-SL, 3M unit cap). **No AMD awareness anywhere.**

**AMD (engine `engine_amd`):**

- OANDA-only (`oanda_amd_demo`), direct REST calls — bypassed the broker adapter entirely. No VT presence.
- One trade per day at the tag entry hour (tag from the 10:31 UTC AMD detector), auto direction.
- Sizing: 2% baseline risk × engine weight × `amd_size_multiplier`; broker-side hard SL 15p.
- Exits: `amdTrailingStopMonitor` (30s) — legacy single 5p trail, S1 time gate for AMD_NONE. The 072 levers (dead-trade abort, trail arm 6p / giveback 4p split, configurable `amd_hard_sl_pips`) existed in config but had **no dashboard UI**.
- `amd_trail_stop_state` had no `broker_id`; the monitor assumed every row was OANDA.

## What was built

1. **AO AMD-day gate** — `src/core/alphaOmega/alphaOmegaAmdDayGate.ts`, wired into both AO entry paths (multi-broker fan-out + Lane B crack side-path). Blocks only when today's `amd_state.amd_tag = 'AMD_FAILED'` AND signal time ≥ tag write time. Fail-open on any read problem. Shadow-logs `would_skip` advisories while OFF. Block reason: `ALPHAOMEGA_AMD_DAY_GATE`.
2. **AMD dual-book fan-out (AO-style peers)** — `submitAmdDualBook` → `Promise.allSettled` via `settleBrokerFanOutTasks`. OANDA (`placeAmdOandaLeg`) and VT (`placeAmdVtLeg`) place together. VT sizes against live VT equity × `amd_vt_size_multiplier`, MetaApi magic **88005**, own `bridge_trade_log` + `amd_trail_stop_state` on `vtmarkets_ao_live`. One venue failing does not unwind the other. VT arming also requires healthy AO VT route (`isAoVtRouteHealthy`). VT misses write `BLOCKED` (not silent).
3. **Venue-aware exits** — `src/services/amd/amdVenueOps.ts` + reworked `amdTrailingStopMonitor.ts`: per-broker open-id snapshots, venue-routed closes and closed-trade details. A failed venue snapshot skips its rows for the cycle (never false-flags "externally closed"). Decision price stays OANDA mid for both venues. All exit logic applies identically to both books.
4. **Safety hardening** — per-venue once-per-day EXECUTED guards (`hasAmdVenueExecutedToday`); day gate is `hasAmdEntryWorkRemaining` (allows VT-only retry if OANDA already filled); engine-aware magic in `brokerFactory` (AO 88004 / AMD 88005); Activity ledger exclusion engine-aware (AMD VT fills visible); `engine_id='omega'` filters on AO close-log lookups and dashboard `fetchTradeLogStatus`.
5. **Dashboard (Phase 2 panel)** — master **Combined Stack** toggle (writes the three keys below together; honest MIXED state) + individual toggles: AO AMD-day gate, AMD dead-trade abort, AMD trail split 6/4.

## Config keys (all default OFF / safe)

| Key | Default | Meaning |
| --- | --- | --- |
| `alpha_omega_amd_day_gate_enabled` | false | AO skips AMD_FAILED-day entries after 10:31 UTC tag |
| `amd_vt_mirror_enabled` | false | AMD VT peer leg enabled (also needs active `engine_amd`→`vtmarkets_ao_live` link + healthy AO VT route) |
| `amd_vt_size_multiplier` | 0.05 | VT-leg-only sizing knob (0.01–2 valid; ~0.01 lots in validation) |
| `amd_dead_trade_abort_enabled` (072) | false | Master switch member |
| `amd_trail_split_enabled` (072) | false | Master switch member |
| `amd_hard_sl_pips` (072) | 15 | Deliberately NOT touched by master switch; SQL-only |

Master switch = the gate + the two 072 boolean levers. `amd_vt_mirror_enabled` is independent of the master.

## Rollout

1. Apply migration 073, deploy — everything OFF; AO gate shadow-logs from day one.
2. Flip `amd_vt_mirror_enabled` + activate the `engine_amd`→VT link → 0.01-lot validation (account confirmed hedging; AO/AMD tickets coexist).
3. Verify one full VT cycle: magic-88005 fill, Activity row, venue-tagged trail state, monitored close with MetaApi deal-history PnL.
4. After clean days: flip the master Combined Stack switch.
5. Later, separately: SL10 + 1.5× sizing per 072 guidance.

## Verification done

- `npx tsc --noEmit` clean (root + dashboard; dashboard has 2 pre-existing stale `.next` type errors for a deleted page).
- `npm test`: 127/128 pass — 14 new tests (gate causality/boundary/fail-open, VT multiplier clamps, venue broker defaults); the 1 failure is a pre-existing path-alias issue in `resolvePnlCalendarTradeR.test.ts`.
