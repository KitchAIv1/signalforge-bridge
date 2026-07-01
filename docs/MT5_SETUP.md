# MT5 (VT Markets) Setup Checklist

Operational steps before enabling MT5 execution. Bridge code ships with MT5 **disabled** until you complete this list.

## 1. VT Markets demo accounts

- Open **two** MT5 demo accounts: **STP**, **USD**, **$25,000** each (one for OMEGA, one for FADE).
- Note **server name**, **login**, and **password** for each.
- In MT5 Market Watch, confirm tradable symbols (e.g. `AUDUSD-STD` for **Standard STP** — see [VT Help: symbol suffixes](https://get.vtmarkets.help/hc/en-us/articles/42847655982105)).

## 2. MetaApi

1. Sign up at [metaapi.cloud](https://metaapi.cloud) (17-day trial available).
2. Create API token → set `METAAPI_TOKEN` in Railway / `.env`.
3. Add both MT5 accounts in MetaApi dashboard; use region **London** for VT/Asia routing.
4. Copy MetaApi **account IDs** → `METAAPI_OMEGA_ACCOUNT_ID`, `METAAPI_FADE_ACCOUNT_ID`.
5. Run connection smoke test locally (requires `.env` with vars from step 3):

   ```bash
   npm run test:mt5-connection
   ```

   Pass = both accounts show equity, balance, and an `AUDUSD-STD` M5 close price.

## 3. Bridge env vars

```bash
MT5_ENABLED=true
METAAPI_TOKEN=your_token
METAAPI_OMEGA_ACCOUNT_ID=uuid-from-metaapi
METAAPI_FADE_ACCOUNT_ID=uuid-from-metaapi
METAAPI_REGION=london
VT_SYMBOL_SUFFIX=-STD
```

## 4. Database

Run in Supabase SQL Editor:

- `migrations/052_mt5_vt_markets_brokers.sql`

Then activate links when ready:

```sql
UPDATE bridge_brokers SET is_active = true WHERE broker_id IN ('vtmarkets_omega_demo', 'vtmarkets_fade_demo');
UPDATE bridge_links SET is_active = true
  WHERE broker_id IN ('vtmarkets_omega_demo', 'vtmarkets_fade_demo');
```

Rollback to OANDA-only:

```sql
UPDATE bridge_links SET is_active = false WHERE broker_id LIKE 'vtmarkets_%';
```

## 5. Confirm OMEGA signals

On the **engine-omega** Railway service: `OMEGA_PHASE4_ENABLED=true`.

## 6. Pilot cadence

- **Week 1–2:** OANDA candles + VT execution (basis measurement).
- **FADE only (later):** optional switch to VT candles after MetaApi history depth verified.

## 7. Sizing

Run `npm run mt5:sizing-study` for recommended risk-% on $25k accounts.

## 8. Outage / rollback

See [MT5_BROKER_OUTAGE_RUNBOOK.md](./MT5_BROKER_OUTAGE_RUNBOOK.md).
