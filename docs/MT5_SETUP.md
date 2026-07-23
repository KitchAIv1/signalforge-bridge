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

**OMEGA max hold:** VT omega shares the engine-level cap with OANDA via `bridge_engines.max_hold_hours` (currently **3h / 180m** after migration 054). Both brokers force-close at the same wall-clock age from `signal_received_at`.

## 5. Confirm OMEGA signals

On the **engine-omega** Railway service: `OMEGA_PHASE4_ENABLED=true`.

## 6. Pilot cadence

- **Week 1–2:** OANDA candles + VT execution (basis measurement).
- **FADE only (later):** optional switch to VT candles after MetaApi history depth verified.

## 7. Sizing

Run `npm run mt5:sizing-study` for recommended risk-% on $25k accounts.

## 8. Outage / rollback

See [MT5_BROKER_OUTAGE_RUNBOOK.md](./MT5_BROKER_OUTAGE_RUNBOOK.md).

## 9. ALPHAOMEGA dual book (OANDA + VT live)

AO stays on OANDA (`oanda_phase2_demo`) and can also trade a dedicated VT live book (`vtmarkets_ao_live`).

**Schema:**
- `063_vtmarkets_ao_live.sql` — seed inactive AO VT broker + link.
- `064_bridge_brokers_symbol_suffix.sql` — per-broker `bridge_brokers.symbol_suffix` (e.g. `-STD`, `-VIP`, `-ECN`).

**Symbol suffix (multi-account):**
- Each MT5 broker row stores its own suffix. Bridge maps `AUD_USD` → `AUDUSD{suffix}` (hyphen form: `AUDUSD-STD`).
- Resolution: **DB `symbol_suffix` → env `VT_SYMBOL_SUFFIX` → default `-STD`**.
- Live Standard STP books use `-STD`. Demo VIP books use `-VIP`. Do **not** rely on a single global env when mixing account types.
- VT bare `AUDUSD` is reference-only; always use the suffixed tradable symbol in Market Watch.

**Guided bind (Settings → Connect VT Markets):**
1. Add the live VT MT5 account in MetaApi (London). Keep login/server/password in MetaApi only.
2. Ensure dashboard server has `METAAPI_TOKEN` (and bridge has `MT5_ENABLED=true`).
3. In MT5, enable the tradable symbol (e.g. `AUDUSD-STD`).
4. Paste the MetaApi **account UUID**, select the matching suffix → Bind & probe.
5. On success: UUID + `symbol_suffix` saved on `bridge_brokers`, `(omega, vtmarkets_ao_live)` link activated.

Optional env override: `METAAPI_AO_ACCOUNT_ID` (wins over DB UUID when set).

**Runtime notes:**
- AO magic on VT: `88004` (classic omega RAW VT remains `88001`).
- Hard-stop / giveback still use OANDA M5 (parity with Fade/Omega VT pilot).
- Disconnect deactivates the VT route; open VT tickets are fail-closed (no OANDA fallback close).
- Override terminal remains OANDA AO only.
- Full self-serve VT password provisioning (2B) is deferred.
