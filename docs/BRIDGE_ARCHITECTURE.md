# Bridge Architecture — Technical Reference
*SignalForge / Veredix | Last updated: April 2026*

## Overview
signalforge-bridge is the execution layer. It reads 
signals from Supabase signals table, validates them, 
sizes positions, and executes on OANDA. Engines decide 
what to trade. The bridge decides how to execute.

## Engine Routing
Each engine has an entry in bridge_engines table:
- engine_id, weight, is_active, max_hold_hours
- execution_threshold (minimum score to execute)

## Signal Flow (All Engines)
1. Engine writes to signals table
2. Bridge Realtime subscription triggers processSignal
3. Normalize signal (signalValidation.ts)
4. shouldBlockRebuild check (engine_rebuild only)
5. runRiskChecks (correlation, exposure limits)
6. News window logging (omega + engine_rebuild)
7. resolveOmegaDirection (omega only)
8. Bar1 wait + fetchBar1Strength (engine_rebuild only)
9. calculateUnits (positionSizer.ts)
10. finalUnits (cap + bar1 multiplier for rebuild, 
    cap only for others)
11. placeMarketOrder (OANDA)
12. patchTradeTPSL (OANDA — TP/SL after fill)
13. Insert to bridge_trade_log

## Engine-Specific Logic

### Omega
- Direction controlled by OMEGA_DIRECTION_OVERRIDE env var
- Trail stop managed by tradeMonitor every 30 seconds
- TRAIL_STOP_ENGINE_IDS includes omega

### Charlie / Charlie Shadow
- Trail stop managed by tradeMonitor every 30 seconds
- TRAIL_STOP_ENGINE_IDS includes charlie, charlie_shadow
- charlie_shadow bypasses execution_tier gate

### Engine Rebuild
- shouldBlockRebuild: hour gate + R bucket gate
- Bar1 M1 intelligence: 5-min wait + strength sizing
- RC1+RC2+RC3 execution fixes
- Dynamic unit cap: equity × 0.50 / 4 positions / leverage
- See ENGINE_REBUILD.md for full detail

## Key Files
| File | Purpose |
|------|---------|
| src/core/signalRouter.ts | Main signal processing |
| src/core/signalValidation.ts | Signal normalization |
| src/core/positionSizer.ts | Unit calculation |
| src/core/rebuildHelpers.ts | Rebuild-specific helpers |
| src/connectors/oanda.ts | OANDA API calls |
| src/monitoring/tradeMonitor.ts | Open trade monitoring |
| src/monitoring/trailingStopSupport.ts | Trail stop logic |
| supabase/migrations/ | Schema changes |

## Environment Variables (Bridge)
| Variable | Purpose |
|----------|---------|
| OANDA_API_TOKEN | Practice account token |
| OANDA_ACCOUNT_ID | Practice account ID |
| OANDA_ENVIRONMENT | practice or live |
| TRAIL_STOP_ENABLED | true/false |
| TRAIL_STOP_ENGINE_IDS | charlie,charlie_shadow,omega |
| TRAIL_STOP_SL_MULTIPLIER | 1.5 |
| TRAIL_STOP_TRAIL_DISTANCE | 1.5 |
| OMEGA_DIRECTION_OVERRIDE | long or short |

## Migrations Applied
| Migration | Change |
|-----------|--------|
| 007 | trail_stop_state table |
| 008 | bar1 columns on bridge_trade_log |
