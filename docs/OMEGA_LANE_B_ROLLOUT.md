# Omega Lane B — Phase 2 Rollout (W0 Shadow)

Lane A (`oanda_practice`) stays RAW. Lane B (`oanda_phase2_demo` / AUD_NEWWWW) runs R1 + Phase 2 gates at fan-out only.

## Pre-deploy

1. Apply `migrations/055_omega_lane_b_phase2_demo.sql` in Supabase.
2. Set env on bridge host: `OANDA_PHASE2_ACCOUNT_ID=101-001-38709456-003`
3. Confirm `bridge_links`: `oanda_practice` + `oanda_phase2_demo` active; `vtmarkets_omega_demo` inactive for omega.
4. Restart bridge after env + migration.

## W0 defaults (migration 055)

| `bridge_config` key | Default |
|---------------------|---------|
| `omega_lane_b_r1_enforce` | `false` |
| `omega_lane_b_phase2_shadow` | `true` |
| `omega_lane_b_phase2_enforce` | `false` |

Shadow mode: gates log `lane_advisory` on executed rows; trades still fill on Lane B.

## Weekly enablement

| Week | Set in Supabase `bridge_config` |
|------|----------------------------------|
| W1 | `omega_lane_b_r1_enforce` → `true` |
| W3+ | `omega_lane_b_phase2_enforce` → `true` (after Jul-3-type days stay clean) |

## Verification

- `/activity` — unchanged; filter `oanda_practice` for Lane A.
- `/omega-phase2` — Lane B only (`oanda_phase2_demo`).
- Same signal → two `bridge_trade_log` rows (different `broker_id`).

## Rollback

```sql
UPDATE bridge_links SET is_active = false
WHERE engine_id = 'omega' AND broker_id = 'oanda_phase2_demo';
```

Lane A continues unaffected.
