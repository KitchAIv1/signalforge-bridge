# Omega Lane B — ALPHAOMEGA Rollout

**Status:** Live (July 2026)  
**Lane A:** `oanda_practice` — RAW Omega (unchanged by ALPHAOMEGA logic)  
**Lane B:** `oanda_phase2_demo` — ALPHAOMEGA validated entry/exit  

> Supersedes the W0 “R1 / Phase 2 shadow gate” enablement table. Those flags from migration `055` are historical; live decisions come from ALPHAOMEGA (`057`+). Full contract: [ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md](./ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md).

---

## Pre-deploy

1. Apply migrations in order: `055` → `057` → `058` → `060` (plus `056` if AMD dedicated account not yet applied; `059` for Lane A RAW trail only).
2. Set on bridge host: `OANDA_PHASE2_ACCOUNT_ID=<phase2-practice-account>`.
3. Confirm `bridge_links`: `oanda_practice` + `oanda_phase2_demo` active for omega as intended.
4. Restart bridge after env + migration.

---

## Live config keys (`bridge_config`)

| Key | Typical / default | Meaning |
|-----|-------------------|---------|
| `alpha_omega_enabled` | `true` | Master kill switch for Lane B ALPHAOMEGA |
| `alpha_omega_pure_sizing` | operator choice | Base-risk-only sizing when `true` |
| `alpha_omega_giveback_trail_enabled` | `false` | Peak ≥6p then giveback 3p when `true` |

Legacy Phase-2 keys from `055` (`omega_lane_b_r1_enforce`, `omega_lane_b_phase2_shadow`, `omega_lane_b_phase2_enforce`) are **not** the current entry/exit authority once ALPHAOMEGA is enabled.

---

## Verification

| Check | Expectation |
|-------|-------------|
| `/activity` | Filter `oanda_phase2_demo` for Lane B; Lane A via `oanda_practice` |
| `/omega-phase2` | Streak radar, scoreboard, Open Risk (peak / giveback when armed) |
| Same Omega fire | Up to two `bridge_trade_log` rows (different `broker_id`) when both lanes execute |
| Telegram | ALPHAOMEGA-tagged Lane B entries / exits |
| Giveback off | Behavior bit-identical to pre-`060` exits (flag default false) |

---

## Giveback trail enablement (optional)

1. Confirm migration `060` applied (`peak_favorable_pips` column exists).
2. Set `alpha_omega_giveback_trail_enabled` → `true` in Supabase (no redeploy required).
3. Watch Open Risk for peak/arm text; closes show “Giveback trail” / `GB` on scoreboard.

---

## Rollback

**Stop Lane B fills:**

```sql
UPDATE bridge_links SET is_active = false
WHERE engine_id = 'omega' AND broker_id = 'oanda_phase2_demo';
```

**Disable ALPHAOMEGA logic (keep link):**

```sql
UPDATE bridge_config
SET config_value = 'false'::jsonb
WHERE config_key = 'alpha_omega_enabled';
```

Lane A continues unaffected either way.
