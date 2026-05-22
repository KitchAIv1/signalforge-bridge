# Roadmap

## Purpose

This roadmap captures product and technical work that is visible from the current repository but not fully shipped. It separates current behavior from future plans so documentation does not imply support that does not exist yet.

## Near-Term Documentation Hardening

- Keep `docs/veredix/` as the canonical Veredix product and technical reference.
- Update old docs or add pointers so readers know where current behavior lives.
- Confirm the canonical migration path between `migrations/` and `supabase/migrations/`.
- Sanitize env examples so no real-looking credentials or account identifiers remain.
- Add a dashboard setup checklist covering all required RLS and intelligence migrations.
- Document every future config key with default, UI writer, runtime reader, and expected effect.

## Security And Access

Current state: dashboard has no auth and uses Supabase anon access from the browser.

Planned work:

1. Decide deployment threat model: local-only, VPN/internal, or public with auth.
2. Add authentication if dashboard is exposed beyond a trusted environment.
3. Add operator identity to dashboard writes.
4. Add explicit confirmation for kill switch, bridge off, and Omega direction changes.
5. Review RLS policies for least privilege.
6. Rotate any exposed keys if examples or historical files contained real values.
7. Separate read-only analytics users from trading-control users.

## Broker Expansion To VT Markets

Current state: schema is broker-aware, runtime execution is OANDA-only.

Phases:

### Phase 1: Broker Interface

- Define shared broker types and methods.
- Wrap OANDA in the interface.
- Add fake broker tests for success, cancel, timeout, close, and candle paths.
- Preserve existing OANDA behavior before adding new broker support.

### Phase 2: Runtime Routing

- Use `bridge_links` to resolve engine-to-broker routing.
- Persist broker ID and type on all trade rows.
- Add broker-specific health and account summary state.
- Keep OANDA as the default route.

### Phase 3: VT Markets Connector

- Map instruments, units, lot sizing, margin, and pip values.
- Confirm market order, fill, TP/SL, close, and transaction semantics.
- Implement VT Markets connector behind the broker interface.
- Add dry-run or paper mode before live enablement.

### Phase 4: Dashboard Support

- Show broker-level account and health cards.
- Show broker route per engine.
- Add broker filter to Activity and Calendar.
- Add control warnings for broker-specific limitations.

## Dashboard Product Decisions

Open decisions:

- Should `/omega` and `/rebuild` shadow pages become visible, remain hidden, or be removed?
- Should Bridge ON/OFF live on Overview, Settings, or both?
- Should Omega direction be controlled only from Engine Controls or also from Regime panel?
- Should AMD manual override UI be mounted, documented as planned, or removed?
- Should mobile support include emergency controls or be read-only?
- Should Intelligence weekly eval run on a server schedule instead of client-side page open?
- Should close tags feed Intelligence observations directly?

## Engine And Intelligence Work

Potential work:

- Restore or formally remove deduplication behavior.
- Decide whether Rebuild bar1 multipliers should remain neutral at 1.0 or return to documented weighted sizing.
- Move Rebuild helper logic out of `signalRouter.ts` into focused modules.
- Make AMD panel copy reflect both advisory state and live impact.
- Decide whether regime multiplier should influence sizing or stay audit-only.
- Confirm Sigma engine status and seed/runtime support.
- Add migration ownership for shadow table schemas if dashboard depends on them.

## Operations And Reliability

Planned improvements:

- Add markdown lint or docs link checks.
- Add startup validation for required config keys.
- Add a single migration verification script for all post-000 migrations.
- Add structured event logging for dashboard control writes.
- Add alerting for stale heartbeat, OANDA failures, repeated bounds violations, and unexpected blocked spikes.
- Add a broker outage runbook with manual recovery steps.
- Add smoke tests for dashboard RLS updates.

## Data And Analytics

Planned improvements:

- Define retention policy for `bridge_trade_log`, candle JSON fields, health logs, and research outputs.
- Decide whether generated CSV/JSON outputs should be committed or stored externally.
- Add a data dictionary for every `bridge_trade_log` intelligence field.
- Add Intelligence ingestion of manual and close tags.
- Add cohort definitions for Calendar beyond the hardcoded current start date.

## VT Markets Readiness Checklist

Before live VT Markets execution:

- Broker interface exists and OANDA passes regression tests.
- VT Markets sandbox or practice path is validated.
- Credential storage is decided and not browser-readable.
- Instrument mapping is documented.
- Unit, lot, and margin calculations are verified.
- TP/SL and close semantics are verified.
- Netting/hedging behavior is verified for Omega flips.
- Dashboard displays broker route and broker status.
- Trade log records broker ID and broker type.
- Kill switch, engine pause, and max-hold work across brokers.
- Rollback plan exists to OANDA-only routing.

## Documentation Backlog

- Add screenshots or annotated UI flows after product layout stabilizes.
- Add a full data dictionary for AMD and regime tables.
- Add a broker contract test document.
- Add a release checklist for strategy changes.
- Add an incident postmortem template.
- Add a glossary entry for every engine and intelligence layer.
