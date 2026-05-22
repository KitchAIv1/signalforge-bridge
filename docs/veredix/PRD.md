# Veredix PRD

## Product Summary

Veredix is an internal trading execution and intelligence platform. It connects external signal engines to broker execution through a controlled bridge, gives the operator a dashboard for live controls and review, and builds a research loop from trade outcomes, AMD state, regime state, and shadow datasets.

The product does not create every trading signal inside this repository. Engines generate signals elsewhere and insert them into Supabase. Veredix owns the execution decision, risk controls, broker integration, audit log, monitoring loop, and operator UI.

## Problem

The trading stack has grown from bridge execution into a broader operational system: live engine control, OANDA order handling, Rebuild execution fixes, Omega direction control, AMD/regime intelligence, shadow research, dashboard analytics, and future broker expansion. The behavior exists across code, migrations, scripts, and ad hoc docs, but there is no single product-level source of truth.

Without a PRD and full documentation set, it is hard to:

- Explain exactly what Veredix is and what it is not.
- Onboard a new engineer or operator.
- Compare live bridge behavior with engine or shadow assumptions.
- Add VT Markets without breaking OANDA behavior.
- Decide which dashboard controls are operational, advisory, WIP, or deprecated.
- Keep risk, broker, and intelligence changes auditable.

## Goals

- Define the full Veredix product boundary across engine inputs, bridge execution, dashboard UX, Supabase state, OANDA, and future VT Markets work.
- Capture live workflows for signal processing, trade execution, monitoring, operator controls, intelligence review, and incident response.
- Document parameters, config keys, migrations, environment variables, and risk logic in a discoverable format.
- Identify product and technical gaps that should become roadmap items rather than hidden assumptions.
- Create documentation that can evolve with the system while staying under focused file-size limits.

## Non-Goals

- Rebuild the engine runtime source in this repository.
- Replace existing research notebooks or CSV outputs.
- Document real credentials, account IDs, or secret values.
- Treat future VT Markets support as shipped behavior.
- Convert hidden Omega/Rebuild shadow pages into visible product without a separate implementation decision.

## Primary Personas

| Persona | Needs |
| --- | --- |
| Operator | Start/stop the bridge, pause engines, flip Omega direction, inspect health, review trades, tag close quality, and react to incidents. |
| Strategy Builder | Understand engine behavior, shadow/live divergence, AMD/regime evidence, and research outputs. |
| Bridge Engineer | Maintain execution correctness, risk controls, OANDA integration, Supabase schema, dashboard controls, and future broker routing. |
| Product Owner | Track shipped behavior, open decisions, risk limits, roadmap, and operational readiness. |

## Product Scope

### In Scope

- Supabase `signals` subscription and bridge signal pipeline.
- Per-engine execution controls through `bridge_engines` and `bridge_config`.
- OANDA v20 order placement, TP/SL patching, close handling, account summary, open trade sync, pricing, and candle fetches.
- Dashboard routes: Overview, Activity, AMD History, Calendar, Health, Intelligence, Settings.
- Engine controls: pause/resume, Omega direction, AMD auto/manual mode, Rebuild bounds retry, Rebuild hour gate.
- AMD daily intelligence and auto-direction fields.
- Regime detection and Omega audit fields.
- Rebuild execution improvements: hour gate, R bucket gate, bar1 capture, dynamic cap, bounds retry, SL widen, corrected TP.
- Trade log, health log, RLS policies, config defaults, migration order, and ops runbooks.
- Future broker abstraction requirements for VT Markets.

### Out Of Scope For Current Runtime

- Native multi-broker execution routing.
- Dashboard authentication and user roles.
- Server-side scheduled Intelligence evaluations.
- Production-grade VT Markets order placement.
- Full engine source code ownership.

## User Workflows

### Start And Monitor The Bridge

1. Operator confirms env vars and Supabase migrations are present.
2. Bridge starts on Railway or locally.
3. Startup loads `bridge_config`, active engines, OANDA summary, reconciliation, heartbeat, trade monitor, regime cron, AMD cron, and Supabase Realtime subscription.
4. Dashboard Health and Overview confirm OANDA, Supabase, heartbeat, account snapshot, and recent trades.

### Execute A Signal

1. Engine inserts into `signals`.
2. Bridge validates freshness, shape, engine state, paused state, circuit breaker, open-position conflicts, Rebuild gates, and risk.
3. Bridge resolves engine-specific behavior such as Omega direction, AMD/regime audit, Rebuild bar1 wait, or news handling.
4. Bridge calculates units, applies engine caps or multipliers, sends a market order to OANDA, and logs the decision.
5. Trade monitor keeps `bridge_trade_log` aligned with OANDA and closes max-hold or trail-stop trades.

### Control Engines From The Dashboard

1. Operator opens Activity.
2. Engine Controls reads `paused_engines`, `omega_direction`, `direction_mode`, `rebuild_bounds_retry`, and `rebuild_hour_gate_enabled`.
3. Operator pauses an engine, flips Omega in manual mode, switches AMD auto/manual mode, toggles Rebuild retry, or toggles Rebuild hour gate.
4. Bridge reads those control keys fresh per signal.

### Review Performance And Intelligence

1. Operator reviews Activity rows, filters by decision and engine, exports CSV, and tags close quality.
2. Operator uses Calendar for closed Omega/Rebuild P&L since the configured cohort start.
3. Operator uses AMD History to verify daily AMD classification against chart data.
4. Operator uses Intelligence to review AMD performance, time gates, observation backlog, direction source breakdown, and Claude weekly evaluation.

## Functional Requirements

| ID | Requirement |
| --- | --- |
| PRD-001 | Veredix must log every execution decision to `bridge_trade_log`. |
| PRD-002 | Veredix must never write source signals or engine outcome tables from bridge execution paths. |
| PRD-003 | The bridge must read OANDA credentials from environment variables, not database rows. |
| PRD-004 | The dashboard must expose live controls only through documented `bridge_config` keys. |
| PRD-005 | Operator actions that affect trading must be auditable through config timestamps, trade log decisions, or health logs. |
| PRD-006 | Rebuild-specific gates and fixes must be documented separately from general bridge logic. |
| PRD-007 | Omega direction, AMD auto/manual mode, and opposing-position safety behavior must be documented as operational controls. |
| PRD-008 | Future VT Markets support must preserve the OANDA execution contract through a broker interface. |
| PRD-009 | Hidden or WIP dashboard surfaces must be explicitly labeled in documentation. |
| PRD-010 | Product docs must distinguish shipped behavior, known drift, known gaps, and roadmap items. |

## Non-Functional Requirements

- Latency: bridge skips signals beyond `max_latency_ms` after receipt, default 500 ms.
- Freshness: bridge skips stale signals beyond `stale_signal_max_age_ms`, default 60 seconds.
- Health: heartbeat and trade monitor default to 30 second intervals.
- Safety: kill switch, engine pause, market-closed check, max hold, and OANDA failure handling must fail closed.
- Auditability: every order fill, block, skip, close, TP/SL correction, and relevant intelligence snapshot should be inspectable from Supabase.
- Maintainability: documentation files should remain focused and under 500 lines.

## Success Metrics

- A new engineer can trace signal insertion to OANDA execution using these docs without reading every file first.
- An operator can find the correct control for bridge active, kill switch, engine pause, Omega direction, and Rebuild gates.
- Known drift between old docs and current runtime is visible.
- Broker expansion work has a clear checklist before VT Markets code begins.
- Dashboard route ownership and data dependencies are explicit.

## Launch Criteria

- `docs/veredix/` contains the complete doc set from the documentation plan.
- Each file is scoped, readable, and internally linked from the index.
- Current runtime behavior is documented where it differs from old docs.
- Future work is captured as roadmap or open decisions, not implied shipped functionality.

## Known Gaps

- No dashboard authentication or role model exists today.
- VT Markets is a roadmap item, not a runtime connector.
- Broker routing tables exist, but execution imports OANDA directly.
- Shadow analytics pages exist but redirect to Overview.
- AMD panel copy and AMD auto-direction behavior need a clearer UX distinction between advisory data and live control impact.
