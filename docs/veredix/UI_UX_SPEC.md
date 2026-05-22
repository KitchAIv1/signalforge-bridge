# UI UX Spec

## Product Role

The dashboard is an internal operations console for Veredix. It is designed for monitoring, control, review, and intelligence analysis. It is not a public customer-facing app and currently has no login or role model.

## Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind
- Supabase browser client
- TradingView embed
- lightweight-charts
- Recharts
- Anthropic API through one server route

Local port: 3001.

## Access Model

The dashboard uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the browser. RLS policies define what the anon key can read and update. Anyone with dashboard access and the anon key can perform allowed operations.

Product requirement: deployment should be treated as internal-only until authentication, authorization, and audit user identity are added.

## Navigation

Visible routes are defined in `dashboard/components/navLinks.ts`:

| Route | Purpose |
| --- | --- |
| `/` | Overview, status, bridge toggle, engines, recent trades. |
| `/activity` | Primary operator workspace: controls, charts, intelligence panels, trade log. |
| `/amd-history` | AMD daily history and chart verification. |
| `/calendar` | P&L calendar and equity review for selected engines. |
| `/health` | OANDA/Supabase status and heartbeat timeline. |
| `/intelligence` | AMD analytics, observation backlog, and Claude evaluation. |
| `/settings` | Bridge toggle and kill switch. |

Hidden routes:

| Route | Current Behavior |
| --- | --- |
| `/omega` | Redirects to Overview. Shadow hooks/components exist. |
| `/rebuild` | Redirects to Overview. Shadow hooks/components exist. |

## Core User Journeys

### Bootstrap

1. Copy dashboard env example to `.env.local`.
2. Set Supabase URL and anon key.
3. Apply dashboard RLS migrations.
4. Run `npm run dev` from `dashboard/` or `npm run dashboard:dev` from repo root.
5. Open `http://localhost:3001`.
6. If env is missing, `SetupGate` blocks the UI and shows setup guidance.

### Check System Status

Overview and Health should answer:

- Is the bridge active?
- Is kill switch off?
- Is OANDA connected?
- Is Supabase reachable?
- When was the last heartbeat?
- What is the account balance/NAV/margin picture?
- Which engines are active?
- What decisions were logged recently?

### Operate Live Controls

Activity exposes the main control dropdown:

- Pause/resume `omega`, `engine_rebuild`, `falcon`, and `sigma`.
- Toggle Omega auto/manual mode.
- Flip Omega long/short when in manual mode.
- Toggle Rebuild bounds retry.
- Toggle Rebuild hour gate.

Settings exposes:

- `bridge_active`
- `kill_switch`

Open decision: bridge active exists in both Overview and Settings. Product should define whether Overview is the canonical daily control and Settings is emergency/config-only, or whether both remain intentionally duplicated.

### Review Trades

Activity supports:

- Decision filter: all, executed, blocked, skipped, deduplicated.
- Engine filter.
- CSV export up to 5000 rows.
- Desktop table and mobile list.
- Close tagging fields for review taxonomy.
- Rich audit columns such as regime, AMD, direction source, size multiplier, P&L, R, duration, and close reason.

### Review AMD

AMD History shows daily `amd_state` rows and lets the operator verify classification against chart data. The AMD panel in Activity shows the current daily tag, range, Judas movement, reversal state, and related context.

UX warning: Activity AMD copy must distinguish observational AMD state from live Omega impact when `direction_mode=auto` or `amd_size_multiplier` is present.

### Review Intelligence

The Intelligence route shows:

- System health ribbon.
- Observation backlog.
- Time gate matrix.
- Tag performance.
- Direction source breakdown.
- Accumulation buckets.
- Snapshot history.
- Claude weekly or manual evaluation.

The weekly auto evaluation is client-side. It runs only when the page is open and the effect fires. Production scheduling should move server-side if this becomes a requirement.

### Review P&L

The Calendar route shows closed trades for Omega and Engine Rebuild from the hardcoded cohort start. It includes month grid, equity curve, summary stats, and day drill-down.

## Control Contract

| UI Control | Config Key | Runtime Effect |
| --- | --- | --- |
| Bridge toggle | `bridge_active` | Bridge exits on startup when false; dashboard can update. |
| Kill switch | `kill_switch` | Circuit breaker blocks trading. |
| Engine pause | `paused_engines` | Bridge blocks matching engine signals per signal. |
| Omega direction | `omega_direction` | Bridge flips Omega execution direction when short. |
| Direction mode | `direction_mode` | Manual lets operator flip; auto lets AMD set direction. |
| Rebuild retry | `rebuild_bounds_retry` | Enables retry without price bound on bounds violation. |
| Rebuild hour gate | `rebuild_hour_gate_enabled` | Enables/disables bad-hour block for Rebuild. |
| Presence ping | `presence_last_seen` | Writes operator presence for sizing/ops logic. |

## Freshness Expectations

| Area | Expected Cadence |
| --- | --- |
| Bridge heartbeat | 30 seconds by default. |
| Trade monitor | 30 seconds by default. |
| Overview/dashboard polling | Around 15 seconds in current implementation areas. |
| Presence write | Around 60 seconds while Activity is mounted and visible. |
| AMD detection | Daily at 10:31 UTC. |
| Regime detection | H4 close plus five minutes. |
| Calendar refresh | Around five minutes. |

## Error And Empty States

Minimum UX requirements:

- Missing env should show setup instructions.
- Supabase query failures should show visible read errors where controls are affected.
- OANDA disconnected should be visible on Health and Overview.
- Empty trade tables should explain current filters.
- Intelligence API failures should show the returned Anthropic or server error.
- Controls should not silently appear successful when Supabase update fails.

## Mobile UX

Mobile support exists through the nav drawer, mobile trade list, and touch-sized controls. Primary mobile tasks should be limited to quick status checks and emergency controls until authentication and stronger confirmation flows exist.

## Known UX Gaps

- No auth or user identity.
- Hidden Omega/Rebuild shadow pages need product disposition.
- Duplicate controls exist for bridge toggle and Omega direction.
- AMD manual override components exist but are not mounted in the main routes.
- Dashboard README does not describe current routes, Intelligence env, or newer RLS migrations.
- Some panels have minimal error state detail.
