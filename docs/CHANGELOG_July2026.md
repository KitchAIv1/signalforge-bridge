# Changelog — July 2026 (v1.2.1)

**SignalForge / Veredix Bridge**
**Window:** 2026-07-01 → 2026-07-18  
**Baseline docs:** last substantive `docs/` touch before the Jul 17 refresh was AMD trail (`d9d7f89`, 2026-07-08).  
**Package version:** `1.0.0` → `1.2.0` → **`1.2.1`**

---

## How to read this

Commits are grouped by product domain, not by day. Commit SHAs are on `main`. Research scripts under `scripts/` that never shipped are listed only when they drove a production decision.

**Companion references**

| Doc | Role |
|-----|------|
| [ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md](./ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md) | ALPHAOMEGA (Lane B) entry/exit/config |
| [OMEGA_LANE_B_ROLLOUT.md](./OMEGA_LANE_B_ROLLOUT.md) | Dual-lane ops / enablement |
| [SYSTEM_Architecture_May2026.md](./SYSTEM_Architecture_May2026.md) | Cron + engine inventory (changelog updated) |
| [veredix/](./veredix/README.md) | Product doc set (index date bumped) |

---

## 1. ALPHAOMEGA / Omega Lane B (primary July theme)

Lane B (`oanda_phase2_demo`) evolved from a Phase-2 shadow-gate experiment into a full **ALPHAOMEGA** validated entry/exit lane. Lane A (`oanda_practice`) stays RAW Omega.

| Date | SHA | Change |
|------|-----|--------|
| 07-07 | `3e2159e` | Dual-OANDA Lane B experiment; migration `055`; Activity isolation |
| 07-07 | `1ca905a` / `01b52a0` | Monitor open trades on correct Lane B OANDA account |
| 07-07 | `d92e75d` / `6935fcd` | Activity: hide Lane B from baseline; restore null-broker BLOCKED |
| 07-07 | `7a13025` | `/omega-phase2` shadow-gate UI (later superseded by ALPHAOMEGA UI) |
| 07-09 | `af799e4` | **Rewire Lane B to ALPHAOMEGA** entry/exit; migration `057` |
| 07-09 | `850df82` | Count streak on every fire before 4-pip gate (parity with research) |
| 07-09 | `200d8db` | Operator UI: live state, scoreboard, decision clarity |
| 07-09 | `a1826d8` | Telegram: Lane B entry tags + validated exit alerts |
| 07-09 | `01597f9` | Show Lane B ALPHAOMEGA blocks on Activity again |
| 07-10 | `b79f4cc` | Dual-lane Override — ALPHAOMEGA own balance/PnL |
| 07-10 | `410db79` | Clear orphaned `alpha_omega_position_state` after max_hold |
| 07-10 | `d4b55da` | Streak radar — 7-step rail + arm-window clarity |
| 07-13 | `fc1d9ea` | Pure Lane B sizing flag (`058`) + stable scoreboard metrics |
| 07-16 | `c5681dd` | Write/display negative AO `pnl_r` (calendar was showing `+0.00`) |
| 07-16 | `684f9f9` | Keep `*.test.ts` out of production `tsc` (Railway) |
| 07-17 | `f266331` | Peak-favorable giveback trail (`060`); flag later enabled live |
| 07-18 | ops + `062` | **Live posture:** pure sizing ON, giveback ON, `omega.weight` **0.25** |

### ALPHAOMEGA live contract (as of 2026-07-18)

| Concern | Value | Notes |
|---------|-------|-------|
| Entry streak | 7 fires | Same direction, gap &lt; 60m |
| Speed ceiling | ≤45 min | Arm window |
| Speed floor | ≥30 min | Sub-30m bursts filtered |
| Opposing count exit | 5 | Primary loss-cut |
| Opposing share | 100% after ≥4 fires | Backup |
| Hard stop | 10 pips | M5 bar check, 30s monitor |
| Backstop crack | Same 7/45 as entry | Own-direction reconfirm then crack |
| Giveback trail | arm 6p / giveback 3p | **`alpha_omega_giveback_trail_enabled = true`** |
| Pure sizing | base risk only | **`alpha_omega_pure_sizing = true`** (Lane B only) |
| Engine weight | **0.25** | `bridge_engines.omega.weight` — **shared with Lane A RAW** |
| Risk @ $100k | **$750**/trade | `equity × 0.25 × 0.03` |

---

## 2. Omega Lane A (RAW)

| Date | SHA | Change |
|------|-----|--------|
| 07-03 | `d60ef7b` | Max hold 6h → 3h (180m); migration `054_omega_max_hold_3h` |
| 07-13 | `9f87dc5` | RAW pure sizing + **1.5p** peak giveback trail; migration `059` |
| 07-15 | `2d85d65` | Centroid Check — read-only w5/c0 health UI on dashboard |

Shadow Trail v1 research/dashboard work from late June remains documented in `OMEGA_SHADOW_TRAIL_V1_SPEC.md` (not re-litigated here).

---

## 3. AMD

| Date | SHA | Change |
|------|-----|--------|
| 07-08 | `9e49d6e` | Dedicated OANDA account; single-order exit; Asian close toggle; migration `056` |
| 07-08 | `d9d7f89` | Pip trail widened **2.5 → 5** |

---

## 4. Dashboard / ops UX

| Date | SHA | Change |
|------|-----|--------|
| 07-07 | `c37cd98` | Harden Override OANDA API routes after token rotation |
| 07-15 | `c91c518` | Paginate P&L calendar past Supabase 1000-row cap |
| 07-16 | `47bf323` | P&L calendar engine filter — AO / AMD / Fade defaults |

Also covered under ALPHAOMEGA: scoreboard, Open Risk, streak radar, dual-lane Override, Activity Lane B visibility fixes.

---

## 5. MT5 / VT Markets (early July)

| Date | SHA | Change |
|------|-----|--------|
| 07-01 | `2cceb2c` | MT5 close P&L, broker badges, ghost cleanup |
| 07-01 | `789c39d` | Close-timestamp spam fix; Telegram close alerts idempotent |
| 07-01 | `b7f71ce` | VT SHORT orders; stop phantom MT5 rows on Activity |

---

## 6. Migrations shipped in this window

| # | File | Purpose |
|---|------|---------|
| 054 | `054_omega_max_hold_3h.sql` | Omega max_hold → 180m |
| 054* | `054_bridge_trade_log_broker_aware_dedup.sql` | Broker-aware dedup (same number series) |
| 055 | `055_omega_lane_b_phase2_demo.sql` | Lane B broker + Phase-2 config keys |
| 056 | `056_amd_dedicated_oanda.sql` | AMD dedicated account wiring |
| 057 | `057_alphaomega_state.sql` | `alpha_omega_streak_state`, `alpha_omega_position_state`, `alpha_omega_enabled` |
| 058 | `058_alphaomega_pure_sizing.sql` | `alpha_omega_pure_sizing` |
| 059 | `059_omega_raw_pure_sizing_15p_trail.sql` | Lane A RAW pure sizing + 1.5p trail |
| 060 | `060_alphaomega_giveback_trail.sql` | `peak_favorable_pips` + giveback flag |
| 062 | `062_alphaomega_live_posture_weight025.sql` | Weight 0.25 + pure sizing ON + giveback ON |

\* Two files share the `054_` prefix — apply both if not already applied.  
\* `061` is PDL Window engine (separate from AO posture).

---

## 7. Research that informed production (not product code)

| Topic | Outcome that shipped |
|-------|----------------------|
| Jul 9 hard-stop / entry-speed session | ALPHAOMEGA thresholds (7/45, floor 30, opposing 5, hard 10) |
| Jul 17 giveback-trail backtest | Lane B trail act **6p** / giveback **3p** (`f266331`, flag off) |
| AO 3-day quant autopsy | Exit giveback diagnosis; opposing=6 rejected on full book |

---

## 8. Intentionally not changed

- Lane A RAW signal path and Trail v1 / max-hold contract (except pure sizing + 1.5p trail from `059`).
- AMD tag / direction intelligence model (only account isolation + trail width).
- Scalper / Rebuild / Falcon pause posture from May architecture snapshot.

---

## Versioning

| Field | Value |
|-------|-------|
| npm `package.json` version | **1.2.1** |
| ALPHAOMEGA reference | **v1.0.0** (July 2026; live posture 2026-07-18) |
| Suggested git tag | `v1.2.1` |

Bump rule: **1.2.0** = dual-lane + ALPHAOMEGA + giveback capability; **1.2.1** = live posture docs + migration `062` (weight 0.25, flags ON).
