# Engine ALPHAOMEGA — Technical Reference v1.0.0

**SignalForge / Veredix | July 2026**  
**Lane:** Omega Lane B (`oanda_phase2_demo`) only  
**Instrument:** AUD_USD (same Omega signal stream as Lane A)

Lane A (`oanda_practice`) is **not** governed by this document. See RAW Omega / Trail docs for Lane A.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-17 | Giveback trail (6p / 3p), flag off — migration `060`, commit `f266331` |
| 2026-07-16 | Negative `pnl_r` write + calendar display — `c5681dd` |
| 2026-07-13 | Pure sizing flag — migration `058`, `fc1d9ea` |
| 2026-07-09 | Initial ALPHAOMEGA rewire — migration `057`, `af799e4` |

---

## 1. Purpose

ALPHAOMEGA replaces the early July Phase-2 R1/shadow gate experiment on Lane B with a **validated streak-crack entry** and a **multi-trigger exit stack** (opposing fires, hard stop, backstop crack, optional giveback trail). One Omega signal fan-out can still produce two `bridge_trade_log` rows (Lane A + Lane B); only Lane B uses ALPHAOMEGA decisions.

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
Config: `alpha_omega_giveback_trail_enabled` default **false** (migration `060`). **Apply `060` before enabling** — monitor selects `peak_favorable_pips`.

---

## 5. Sizing

| Mode | Config | Behavior |
|------|--------|----------|
| Default | `alpha_omega_pure_sizing = false` | Normal risk pipeline (AMD/news/confluence/graduated may apply) |
| Pure | `alpha_omega_pure_sizing = true` | Base risk only; neutral confluence band for unit calc |

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

1. Migrations `055` → `057` → `058` → `060` applied (and `059` only if Lane A RAW trail desired).
2. Env: `OANDA_PHASE2_ACCOUNT_ID` set on Railway.
3. `bridge_links`: `oanda_phase2_demo` active for omega.
4. Confirm `alpha_omega_enabled = true`.
5. Optionally set `alpha_omega_pure_sizing` / `alpha_omega_giveback_trail_enabled`.
6. Restart bridge after schema changes that affect monitors.

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
| Migrations | `migrations/057_*.sql` … `060_*.sql` |
| Ops rollout | [OMEGA_LANE_B_ROLLOUT.md](./OMEGA_LANE_B_ROLLOUT.md) |
| July audit | [CHANGELOG_July2026.md](./CHANGELOG_July2026.md) |
