# Engine ALPHAOMEGA — Technical Reference v1.0.0

**SignalForge / Veredix | July 2026**  
**Lane:** Omega Lane B (`oanda_phase2_demo`) only  
**Instrument:** AUD_USD (same Omega signal stream as Lane A)

Lane A (`oanda_practice`) is **not** governed by this document. See RAW Omega / Trail docs for Lane A.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-22 | Asia size: after 3M fillability cap, scale Lane B pure units by **0.10/omega.weight** in 21:00–08:00 UTC (so capped tickets still shrink) |
| 2026-07-22 | Asia session weight (first cut): **0.10** in formula during 21:00–08:00 UTC — superseded same day by post-cap scale |
| 2026-07-18 | Live posture: pure sizing ON, giveback ON, `omega.weight` 0.15→**0.25** — migration `062` |
| 2026-07-17 | Giveback trail (6p / 3p) shipped — migration `060`, commit `f266331` (flag later enabled) |
| 2026-07-16 | Negative `pnl_r` write + calendar display — `c5681dd` |
| 2026-07-13 | Pure sizing flag — migration `058`, `fc1d9ea` |
| 2026-07-09 | Initial ALPHAOMEGA rewire — migration `057`, `af799e4` |

---

## 1. Purpose

ALPHAOMEGA replaces the early July Phase-2 R1/shadow gate experiment on Lane B with a **validated streak-crack entry** and a **multi-trigger exit stack** (opposing fires, hard stop, backstop crack, giveback trail). One Omega signal fan-out can still produce two `bridge_trade_log` rows (Lane A + Lane B); only Lane B uses ALPHAOMEGA decisions.

**Live posture (2026-07-18, migration `062`):** pure sizing ON, giveback trail ON, shared `bridge_engines.omega.weight = 0.25` (also scales Lane A RAW).  
**Asia size posture (2026-07-22):** during **21:00–08:00 UTC**, Lane B AO pure sizing sizes at `omega.weight`, clamps to 3M, then scales units by **0.10/omega.weight** (typically ×0.40 → Asia max **1.2M**). Outside Asia, no post-cap scale. Lane A unchanged.

---

## 2. Architecture

```
Omega fire (every signal decision)
        │
        ▼
alpha_omega_streak_state (singleton)
  streak length / arm / last fire
        │
        ├── Lane B entry gate (crack + speed floor + already-open)
        │         └── OANDA market order on oanda_phase2_demo
        │                   └── alpha_omega_position_state
        │
        └── Open position updates (opposing counts)
                  │
                  ▼
runAlphaOmegaHardStopMonitor() every 30s
  ├── hard stop (10p)
  ├── giveback trail (if enabled)
  └── (opposing / share / backstop also close via fire path + monitor)
```

### Core modules

| Path | Role |
|------|------|
| `src/core/alphaOmega/alphaOmegaConstants.ts` | Thresholds + config keys |
| `src/core/alphaOmega/*` | Streak, entry, opposing, giveback pure logic |
| `src/monitoring/alphaOmegaHardStopMonitor.ts` | 30s price / giveback checks |
| `src/index.ts` | Schedules hard-stop monitor |

### Tables

| Table | Role |
|-------|------|
| `alpha_omega_streak_state` | Singleton live streak machine |
| `alpha_omega_position_state` | Per open Lane B trade (opposing counts, peak favorable) |
| `bridge_trade_log` | Fills / closes / blocks (`broker_id = oanda_phase2_demo`) |
| `bridge_config` | Kill switches and sizing/trail flags |

---

## 3. Entry

| Rule | Constant | Value |
|------|----------|-------|
| Founding streak length | `ENTRY_STREAK_LENGTH` | 7 |
| Arm speed ceiling | `ENTRY_SPEED_CEILING_MIN` | 45 min |
| Arm speed floor | `ENTRY_SPEED_FLOOR_MIN` | 30 min |
| Intra-run gap break | `MAX_INTRA_RUN_GAP_MINUTES` | 60 min |
| One position | — | Block if Lane B already open |

**Crack:** streak arms (≥7 within ≤45m), then direction flips → entry candidate, subject to speed floor and kill switch.

Block reasons (examples): `ALPHAOMEGA_NO_QUALIFYING_CRACK`, `ALPHAOMEGA_SPEED_FLOOR`, `ALPHAOMEGA_ALREADY_OPEN`.

Master switch: `alpha_omega_enabled` (default **true** after migration `057`).

---

## 4. Exit stack

Checked in combination of fire-path updates and the 30s hard-stop monitor. Giveback is **additive** and does not replace other exits.

| Exit | Trigger | `close_reason` |
|------|---------|----------------|
| Opposing count | ≥5 opposing fires since entry | `alphaomega_opposing_count` |
| Opposing share | 100% opposing after ≥4 total fires | `alphaomega_opposing_share` |
| Hard stop | ≥10 pips adverse (M5) | `alphaomega_hard_stop` |
| Backstop crack | Own-direction 7/45 reconfirm then crack | `alphaomega_backstop_crack` |
| Giveback trail | Peak ≥6p then give back 3p from peak | `alphaomega_peak_giveback_trail` |

Giveback constants: `ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS = 6`, `ALPHAOMEGA_GIVEBACK_PIPS = 3`.  
Config: `alpha_omega_giveback_trail_enabled` — **live ON** (migration `062`; schema from `060`).

---

## 5. Sizing

| Mode | Config | Behavior |
|------|--------|----------|
| Legacy | `alpha_omega_pure_sizing = false` | May inherit/use confluence ±, graduated, AMD/news overlays |
| **Live** | `alpha_omega_pure_sizing = true` | `equity × weight × riskPct / signal SL`; confluence forced neutral (80); no graduated/AMD/news on Lane B |

| Parameter | Live value | Notes |
|-----------|------------|-------|
| `bridge_engines.omega.weight` | **0.25** | Shared with Lane A RAW; baseline for AO pure formula |
| Asia session weight | **0.10** | Target risk weight; applied as **post-cap scale** `0.10/omega.weight` in **21:00–08:00 UTC** |
| Pure max abs units | **3,000,000** | Fillability cap before Asia scale |
| Asia max abs units (at cap) | **1,200,000** | `3,000,000 × (0.10/0.25)` |
| `risk_per_trade_pct` | 0.03 | Global |
| Risk $ @ $100k equity (non-Asia) | **$750**/trade | `100000 × 0.25 × 0.03` |
| Risk $ @ $100k equity (Asia, under cap) | **$300**/trade | equivalent to weight 0.10 after ×0.40 scale |
| SL used for units | Signal SL | Not the 10p hard-stop distance |

Lane B advisory tags: `sizing=pure`; in Asia also `asiaW=0.10`.  

Lane A uses separate flag `omega_raw_pure_sizing` — do not confuse with AO pure sizing.

---

## 6. P&L fields

On validated close, Lane B writes `pnl_pips`, `pnl_dollars`, and **`pnl_r`** (including negatives). Dashboard calendar falls back to `pnl_pips / 10` when historical rows lack `pnl_r`.

---

## 7. Operator surfaces

| Surface | What to use it for |
|---------|-------------------|
| `/omega-phase2` | Lane B live state, scoreboard, Open Risk, streak radar |
| `/activity` | Lane B EXECUTED/BLOCKED (filter `oanda_phase2_demo`) |
| Override | Dual-lane balance / PnL for ALPHAOMEGA account |
| P&L calendar | Engine filter includes AO |
| Telegram | Lane B entry tags + exit alerts |

---

## 8. Enablement checklist

1. Migrations `055` → `057` → `058` → `060` → **`062`** applied (and `059` if Lane A RAW trail desired).
2. Env: `OANDA_PHASE2_ACCOUNT_ID` set on Railway.
3. `bridge_links`: `oanda_phase2_demo` active for omega.
4. Confirm live flags: `alpha_omega_enabled`, `alpha_omega_pure_sizing`, `alpha_omega_giveback_trail_enabled` all **true**.
5. Confirm `bridge_engines.omega.weight = 0.25` (shared with Lane A).
6. Next Lane B fill: `lane_advisory` contains `sizing=pure`; giveback closes use `alphaomega_peak_giveback_trail`.
7. Restart bridge after schema migrations that affect monitors (`060` column).

### Rollback (execution only)

```sql
UPDATE bridge_links SET is_active = false
WHERE engine_id = 'omega' AND broker_id = 'oanda_phase2_demo';
```

Or set `alpha_omega_enabled` to `false` (falls back to legacy Lane B behavior per migration comment).

---

## 9. Source of truth

| Artifact | Path |
|----------|------|
| Constants | `src/core/alphaOmega/alphaOmegaConstants.ts` |
| Hard-stop + giveback monitor | `src/monitoring/alphaOmegaHardStopMonitor.ts` |
| Migrations | `migrations/057_*.sql` … `062_*.sql` |
| Ops rollout | [OMEGA_LANE_B_ROLLOUT.md](./OMEGA_LANE_B_ROLLOUT.md) |
| July audit | [CHANGELOG_July2026.md](./CHANGELOG_July2026.md) |
