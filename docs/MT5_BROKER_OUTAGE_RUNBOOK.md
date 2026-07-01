# MT5 Broker Outage Runbook

When VT Markets / MetaApi is down or misbehaving, restore OANDA-only execution without redeploying bridge code.

## Immediate rollback (preferred)

1. **Dashboard → Settings → Broker routes** → click **Rollback: OANDA-only (disable VT)**  
   Or run in Supabase SQL:

   ```sql
   UPDATE bridge_links SET is_active = false WHERE broker_id LIKE 'vtmarkets_%';
   ```

2. **Railway env:** set `MT5_ENABLED=false` and redeploy (optional belt-and-suspenders).

3. Confirm Activity shows new trades with `broker_id = oanda_practice` only.

## Open MT5 positions

- OANDA book continues under trade monitor as today.
- MT5 open tickets remain on VT demo until closed manually in MT5 or MetaApi dashboard, or until MetaApi reconnects and bridge monitor closes them.
- Do **not** delete `bridge_trade_log` rows — they are the audit trail.

## MetaApi token / account issues

| Symptom | Action |
|--------|--------|
| `test:mt5-connection` fails | Verify `METAAPI_TOKEN`, account IDs, London region |
| Broker card shows disconnected | Check MetaApi dashboard account deployment state |
| Orders reject (invalid symbol) | Confirm `VT_SYMBOL_SUFFIX` matches VT account type (Standard STP → `-STD`, ECN → `-ECN`, VIP → `-VIP`) |
| Fill but no trail | Trail uses OANDA M5 candles; close path uses broker client — check `broker_id` on log row |

## Re-enable VT

1. Complete [MT5_SETUP.md](./MT5_SETUP.md).
2. Run `npm run test:mt5-connection`.
3. Activate brokers + links in SQL or Settings panel.
4. Set `MT5_ENABLED=true` on Railway.

## Escalation

- MetaApi status: [metaapi.cloud](https://metaapi.cloud)
- VT Markets support for demo account / server issues
- Keep OANDA execution running — parallel fan-out is designed so OANDA path is independent
