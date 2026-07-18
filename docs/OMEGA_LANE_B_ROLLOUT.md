# Omega Lane B — ALPHAOMEGA Rollout

**Status:** Live (July 2026)  
**Lane A:** `oanda_practice` — RAW Omega  
**Lane B:** `oanda_phase2_demo` — ALPHAOMEGA  

> Supersedes the W0 “R1 / Phase 2 shadow gate” enablement table. Full contract: [ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md](./ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md).

---

## Live posture (2026-07-18)

| Setting | Value | Scope |
|---------|-------|--------|
| `alpha_omega_enabled` | `true` | Lane B master |
| `alpha_omega_pure_sizing` | **`true`** | Lane B sizing only (no confluence/graduated/AMD/news) |
| `alpha_omega_giveback_trail_enabled` | **`true`** | Lane B exits (6p arm / 3p giveback) |
| `bridge_engines.omega.weight` | **`0.25`** | **Shared** — Lane A RAW and Lane B AO |
| `omega_raw_pure_sizing` | `true` | Lane A RAW only (unchanged by AO pure flag) |
| `risk_per_trade_pct` | `0.03` | Global |

Risk $ ≈ `equity × 0.25 × 0.03` (e.g. **$750** per trade on a $100k book).  
Apply migration **`062_alphaomega_live_posture_weight025.sql`** to lock this posture in any environment.

---

## Pre-deploy

1. Apply migrations: `055` → `057` → `058` → `060` → **`062`** (plus `056` AMD / `059` Lane A RAW trail as needed).
2. Set on bridge host: `OANDA_PHASE2_ACCOUNT_ID=<phase2-practice-account>`.
3. Confirm `bridge_links`: `oanda_practice` + `oanda_phase2_demo` active for omega.
4. Restart bridge after schema migrations (`060` adds `peak_favorable_pips`).

---

## Verification

| Check | Expectation |
|-------|-------------|
| `/activity` | Filter `oanda_phase2_demo` for Lane B |
| `/omega-phase2` | Streak radar, scoreboard, Open Risk (peak / giveback) |
| Next AO fill | `lane_advisory` includes `sizing=pure` |
| Giveback close | `close_reason = alphaomega_peak_giveback_trail` |
| Lane A | Still RAW path; sized with weight **0.25** + `omega_raw_pure_sizing` |

---

## Rollback

**AO pure sizing off (restore confluence-capable Lane B sizing):**

```sql
UPDATE bridge_config
SET config_value = 'false'::jsonb
WHERE config_key = 'alpha_omega_pure_sizing';
```

**Giveback off:**

```sql
UPDATE bridge_config
SET config_value = 'false'::jsonb
WHERE config_key = 'alpha_omega_giveback_trail_enabled';
```

**Weight back to 0.15 (both lanes):**

```sql
UPDATE bridge_engines SET weight = 0.15 WHERE engine_id = 'omega';
```

**Stop Lane B fills:**

```sql
UPDATE bridge_links SET is_active = false
WHERE engine_id = 'omega' AND broker_id = 'oanda_phase2_demo';
```
