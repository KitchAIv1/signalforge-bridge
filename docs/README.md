# SignalForge / Veredix Docs

**Bridge version:** `1.2.1` (July 2026)

## Start here

| Doc | When to open it |
|-----|-----------------|
| [CHANGELOG_July2026.md](./CHANGELOG_July2026.md) | What shipped since last docs refresh (commit audit) |
| [ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md](./ENGINE_ALPHAOMEGA_Reference_v1_0_0_July2026.md) | Lane B ALPHAOMEGA entry/exit/config |
| [OMEGA_LANE_B_ROLLOUT.md](./OMEGA_LANE_B_ROLLOUT.md) | Dual-lane ops, **live posture**, rollback |
| [SYSTEM_Architecture_May2026.md](./SYSTEM_Architecture_May2026.md) | Crons, engines, tables, env |
| [veredix/README.md](./veredix/README.md) | Product doc set (PRD → runbook) |

## ALPHAOMEGA live posture (2026-07-18)

| Flag / setting | Value |
|----------------|-------|
| Pure sizing | ON |
| Giveback trail 6p/3p | ON |
| `omega.weight` | **0.25** (shared Lane A + B) |
| Migration | `062_alphaomega_live_posture_weight025.sql` |

## Engine / service references

| Doc | Domain |
|-----|--------|
| [ENGINE_Scalper_Reference_v1_0_0_May2026.md](./ENGINE_Scalper_Reference_v1_0_0_May2026.md) | Scalper |
| [ENGINE_AMD_SYSTEM_REFERENCE.md](./ENGINE_AMD_SYSTEM_REFERENCE.md) / AMD refs in `docs/` | AMD |
| [OMEGA_SHADOW_TRAIL_V1_SPEC.md](./OMEGA_SHADOW_TRAIL_V1_SPEC.md) | Lane A shadow trail research |

## Versioning

- npm: `package.json` → `1.2.1`
- Suggested git tag: `v1.2.1`
- Domain refs keep their own `vX.Y.Z` (e.g. ALPHAOMEGA `v1.0.0`)
