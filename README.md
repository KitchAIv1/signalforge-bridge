# SignalForge Bridge

Standalone Node.js/TypeScript service that listens to the `signals` table in Supabase (Realtime INSERT), runs a 6-step risk pipeline, and executes approved trades on OANDA v20 (practice).

## Setup

1. **Database**: Run the **single migration** in the Supabase SQL Editor (same project as SignalForge engines):
   - **`migrations/000_complete_bridge_schema_and_seed.sql`** — creates all bridge tables and seeds config/engines/links in one go (no ordering assumptions).
   - Alternatively, run 001a → 001b → 001c → 001d → 002 → 003 in that order if you need the split files.
   - **Verify**: Run **`migrations/VERIFY_migration.sql`** (sections 1–8 for spot checks, or the final query in section 9 for a single pass/fail summary).

2. **Env**: Copy `.env.example` to `.env` and set:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `OANDA_API_TOKEN`, `OANDA_ACCOUNT_ID`, `OANDA_ENVIRONMENT=practice`
   - `SIGNAL_TABLE=signals` (default)

3. **Verify**: `npm run test:connection` — prints OANDA balance, EUR_USD price, open trades.

## Run

- **Dev**: `npm run dev`
- **Prod**: `npm run build && npm start`

## Deploy (Railway)

Deploy as a **separate** Railway service. Use the same Supabase project as the engines. Set all env vars in Railway; do not store the OANDA token in the database. `railway.toml` configures build and start commands.

## Dashboard

A web UI for status, activity, health, and settings (Bridge ON/OFF, Kill switch) lives in **`dashboard/`**. See `dashboard/README.md` for setup. Run the dashboard with `cd dashboard && npm run dev` (port 3001). Apply `migrations/004_dashboard_rls.sql` in Supabase so the dashboard can read bridge tables and update the toggles.

## Spec

See `SIGNALFORGE_BRIDGE_BLUEPRINT.md` in the parent BRIDGE folder for the full specification. Bridge does not write to `signals` or `signal_outcomes`; all state is in `bridge_*` tables.
