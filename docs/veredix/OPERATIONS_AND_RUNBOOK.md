# Operations And Runbook

## Local Bridge Setup

1. Install dependencies from the repository root.
2. Copy `.env.example` to `.env`.
3. Set Supabase service-role credentials.
4. Set OANDA credentials and `OANDA_ENVIRONMENT`.
5. Apply migrations to the same Supabase project used by the engines.
6. Run `npm run test:connection`.
7. Run `npm run dev` for local bridge execution.

Production build:

```bash
npm run build
npm start
```

## Dashboard Setup

1. Copy `dashboard/.env.local.example` to `dashboard/.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`.
3. Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Set `ANTHROPIC_API_KEY` if Intelligence evaluation is required.
5. Apply dashboard RLS migrations.
6. Run `npm run dashboard:dev` from root or `npm run dev` from `dashboard/`.
7. Open `http://localhost:3001`.

## Migration Checklist

For a fresh project, prefer `000_complete_bridge_schema_and_seed.sql` for the base schema, then apply later numbered migrations that are not included in that one-shot file.

Minimum operational areas:

- Base bridge tables/config/engine seeds.
- Dashboard RLS.
- Falcon seed if used.
- Trail-stop state if trail stops are enabled.
- Bar1 columns for Rebuild audit.
- Rebuild bounds retry and hour gate config.
- Regime state migrations.
- Dashboard tagging and news RLS.
- AMD intelligence and auto-direction migrations.
- M5 distribution candle storage if AMD distribution tooling is used.

Always run `VERIFY_migration.sql` after base setup where applicable.

## Daily Operator Checklist

- Confirm OANDA is connected on Health.
- Confirm latest heartbeat is recent.
- Confirm bridge is active and kill switch is off.
- Confirm account NAV and margin are reasonable.
- Review paused engines.
- Confirm Omega direction and `direction_mode`.
- Confirm Rebuild hour gate and retry settings.
- Review recent blocked decisions for unexpected reasons.
- Review open trades and max-hold behavior.
- Review AMD tag after 10:31 UTC.
- Review regime state after H4 close plus five minutes.

## Emergency Controls

| Situation | Action |
| --- | --- |
| Stop all new trading | Turn on `kill_switch` in Settings. |
| Stop bridge processing on next startup | Set `bridge_active=false`. |
| Pause one engine | Add engine ID through Activity Engine Controls. |
| Stop Omega opposing direction risk | Flip Omega only in manual mode and verify old opposing positions close. |
| Rebuild excessive bounds failures | Disable `rebuild_bounds_retry` or pause `engine_rebuild`. |
| OANDA monitor repeated failures | Let process restart after five failures, then verify Health. |

## Incident Response

### OANDA Unreachable At Startup

The bridge retries account summary every 15 seconds until connected. Check:

- OANDA token.
- Account ID.
- Environment practice/live.
- Network and broker status.
- Railway env vars.

### Trade Missing From OANDA Open List

Trade monitor does not infer closure for trades younger than 60 seconds. After that guard, it fetches transaction details and marks the trade closed. If close details are missing, inspect OANDA transactions manually and compare to `bridge_trade_log`.

### Wrong Omega Direction

Check:

- `direction_mode`
- `omega_direction`
- latest `amd_state.auto_direction`
- `bridge_trade_log.direction_source`
- open opposing Omega positions
- dashboard manual flip availability

### Rebuild TP/SL Mismatch

Check:

- Fill price.
- Widened SL from RC2.
- Corrected TP from RC3.
- `patchTradeTPSL` logs.
- OANDA trade order details.
- `bar1_strength` and related fields.

### Dashboard Cannot Update Controls

Check:

- Supabase anon key.
- RLS migrations 004, 009, 010, 013, and 016.
- Browser console errors.
- Whether `bridge_config` row exists.

## Research And Backtest Scripts

Root package scripts:

- `npm run audit:latency`
- `npm run amd-backfill`
- `npm run amd-historical`
- `npm run amd-historical-csv`
- `npm run amd-simulate`
- `npm run amd-detect`

Major research areas:

- `scripts/amd*.ts` for AMD analysis, backfill, simulations, and reports.
- `scripts/sessionHandoff/` for session handoff backtests.
- `scripts/directionFlip/` for direction flip analysis.
- `engine-rebuild/scripts/` for Rebuild execution simulations.
- `engine-omega/scripts/` for Omega/Rebuild shadow overlay backtests.
- `scripts/output/` for generated CSV and JSON outputs.

Generated outputs are useful for analysis but should not be treated as runtime source of truth.

## Deployment Notes

The bridge Railway service uses:

- Nixpacks builder.
- `npm install && npm run build`.
- `npm start`.
- Restart on failure with up to five retries.

Dashboard deployment should be separate from the bridge and should use the same Supabase project. Until auth exists, deploy it only in a trusted/internal environment.

## Observability

Primary observation surfaces:

- Console logs from bridge runtime.
- `bridge_health_log`.
- `bridge_trade_log`.
- `bridge_brokers.connection_status`.
- Dashboard Health page.
- Activity blocked decisions.
- Railway process restart history.

## Maintenance Rules

- Do not commit real credentials.
- Do not expand legacy-sized runtime files for new features; extract helpers or services.
- Keep broker behavior isolated before adding VT Markets.
- Treat dashboard control keys as a public operational contract.
- Document every new config key with default, writer, reader, and effect.
- Add migrations for every persisted field used by runtime or dashboard.
