# Asian Direction Service — Reference

**SignalForge / Veredix | May 2026**
**Migration:** `020_asian_direction_log.sql`
**Source:** `src/services/AsianDirectionService.ts`, `src/services/asianDirection/`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial service reference |

---

## 1. Purpose

Sets `bridge_config.omega_direction` automatically on **AMD_SHIFTED** trading days at Asian session open, using the prior completed D1 candle as the direction signal. Also closes open Omega positions at Asian session end (08:00 UTC).

**Problem solved:** On AMD_SHIFTED days, Omega needs a directional bias before the 10:31 UTC AMD auto-direction cron runs. Asian direction automation derives bias from Friday/prior D1 close vs open and writes it to `omega_direction` with a validity window through the next 08:00 UTC.

**When it fires:**
- **21:10 UTC daily** — `runAsianDirectionSet()` (cron `'10 21 * * *'`)
- **08:00 UTC daily** — `runAsianSessionClose()` (cron `'0 8 * * *'`)

Startup does **not** call `runAsianDirectionSet()` — the 21:10 cron is the sole direction-set trigger (prevents overwriting `omega_direction_valid_until` before AMD state exists).

---

## 2. Cron Schedule

Registered in `src/index.ts` with `{ timezone: 'UTC' }`:

| Cron string | UTC time | Function |
|-------------|----------|----------|
| `'10 21 * * *'` | **21:10 UTC** daily | `runAsianDirectionSet()` |
| `'0 8 * * *'` | **08:00 UTC** daily | `runAsianSessionClose()` |

Log prefix on fire:
```
[AsianDirection] 21:10 UTC cron fired — running direction set
[AsianDirection] 08:00 UTC cron fired — running Asian session close
```

---

## 3. Gate — AMD_SHIFTED Only

After resolving the AMD lookup date (weekend fallback to Friday), the service reads `amd_state.amd_tag` for that date.

**Exact gate** (`AsianDirectionService.ts`):

```typescript
if (amdTag !== 'AMD_SHIFTED') {
  await writeOmegaDirectionValidUntil(supabase, new Date().toISOString());
  await logAsianDirectionRow(supabase, {
    ...emptyLogFields(todayUtc, 'DIRECTION_SET'),
    action: 'SKIPPED_NOT_SHIFTED',
    reason: `AMD tag is ${amdTag} — only AMD_SHIFTED triggers auto-direction`,
    amd_tag: amdTag,
  });
  return;
}
```

**Weekend fallback:** On Sunday 21:00 UTC (Asian open), `amd_state` is looked up using **Friday's** date. Saturday uses Friday defensively.

---

## 4. Direction Logic — Prior D1 Close vs Open

1. Fetch last completed D1 candle strictly before `21:00 UTC` on `tradeDateUtc` via OANDA (`fetchPriorD1Candle`).
2. Compute direction:

```typescript
const priorD1Direction = priorD1.close > priorD1.open ? 'BULLISH' : 'BEARISH';
const directionToSet = priorD1Direction === 'BULLISH' ? 'long' : 'short';
```

3. Body size (pips):

```typescript
Math.round(Math.abs(priorD1.close - priorD1.open) * 10000 * 100) / 100
```

4. If `omega_direction` already equals `directionToSet` → action `NO_CHANGE`, extend `omega_direction_valid_until` to next 08:00 UTC without rewriting direction.

---

## 5. Output

### `bridge_config.omega_direction`

Written via `writeOmegaDirection()` when direction changes on AMD_SHIFTED + valid D1:

| D1 direction | Value written |
|--------------|---------------|
| BULLISH (`close > open`) | `long` |
| BEARISH (`close <= open`) | `short` |

### `bridge_config.omega_direction_valid_until`

Written via `writeOmegaDirectionValidUntil()`:
- **On successful set or NO_CHANGE:** next 08:00 UTC (`nextAsianSessionExpiry()`)
- **On skip (no AMD, not shifted, no D1):** `NOW()` — expires the Asian window immediately

Consumed by `signalRouter.ts` `isOmegaWindowActive()` — Omega signals blocked when expired.

### `asian_direction_log`

Every run inserts one audit row via `logAsianDirectionRow()`.

### Telegram

Non-fatal alerts via `sendAsianOpenAlert()` on direction change, `sendAsianCloseAlert()` on session close.

---

## 6. Failure Modes

| Action | Meaning |
|--------|---------|
| `SKIPPED_NO_AMD` | No `amd_state` row for lookup date (or query error). Sets `omega_direction_valid_until` to NOW. |
| `SKIPPED_NOT_SHIFTED` | AMD tag exists but is not `AMD_SHIFTED`. Sets `omega_direction_valid_until` to NOW. |
| `SKIPPED_NO_D1` | OANDA D1 fetch failed or returned zero candles. Sets `omega_direction_valid_until` to NOW. |
| `NO_CHANGE` | Direction already matches computed value. Extends valid_until to next 08:00. |
| `SET_LONG` / `SET_SHORT` | Direction written (or write attempted). |
| `ASIAN_CLOSE` | 08:00 UTC session close logged (see §7). |

Reason strings are stored in `asian_direction_log.reason`.

---

## 7. Session Close — `runAsianSessionClose()` at 08:00 UTC

At 08:00 UTC:
1. Reads current `omega_direction` (defaults to `'long'` if missing).
2. Calls `closeAllOpenOmegaPositions(supabase, currentDirection)` — closes open Omega trades in `bridge_trade_log` matching the **current** direction on OANDA.
3. Logs `ASIAN_CLOSE` row to `asian_direction_log`.
4. Sends Telegram close alert (non-fatal).

**Note:** `positions_closed` and `asian_session_result` columns exist in schema but are **never populated** by current code.

---

## 8. Key Tables — `asian_direction_log`

**Schema** (`migrations/020_asian_direction_log.sql`):

| Column | Type | Purpose |
|--------|------|---------|
| `id` | bigserial | Primary key |
| `trade_date` | date | UTC date of trigger |
| `triggered_at` | timestamptz | Execution timestamp |
| `trigger_type` | text | `DIRECTION_SET` or `ASIAN_CLOSE` |
| `amd_tag` | text | AMD tag at time of run |
| `prior_d1_direction` | text | `BULLISH` / `BEARISH` |
| `prior_d1_body_pips` | numeric | D1 body size |
| `prior_d1_close` | numeric | D1 close price |
| `direction_set` | text | `long` / `short` target |
| `previous_direction` | text | Prior `omega_direction` |
| `direction_changed` | boolean | Whether direction was updated |
| `action` | text | See §6 |
| `reason` | text | Human-readable detail |
| `positions_closed` | integer | **[VERIFY — never written]** |
| `asian_session_result` | text | **[VERIFY — never written]** |
| `created_at` | timestamptz | Row insert time |

### Supabase query results (2026-05-31)

```sql
SELECT COUNT(*),
  COUNT(*) FILTER (WHERE action='SET_LONG') as set_long,
  COUNT(*) FILTER (WHERE action='SET_SHORT') as set_short,
  COUNT(*) FILTER (WHERE action LIKE 'SKIPPED%') as skipped,
  MIN(trade_date) as earliest,
  MAX(trade_date) as latest
FROM asian_direction_log;
```

| count | set_long | set_short | skipped | earliest | latest |
|-------|----------|-----------|---------|----------|--------|
| 53 | 1 | 1 | 42 | 2026-05-24 | 2026-05-31 |

**Action breakdown:**

| action | n |
|--------|---|
| SKIPPED_NOT_SHIFTED | 17 |
| SKIPPED_NO_AMD | 15 |
| SKIPPED_NO_D1 | 10 |
| ASIAN_CLOSE | 8 |
| SET_LONG | 1 |
| SET_SHORT | 1 |
| NO_CHANGE | 1 |

---

## 9. Known Limitations

- **Sparse log:** Service recently enabled; only 2 direction sets in production data (2026-05-24 → 2026-05-31).
- **AMD_SHIFTED dependency:** Non-shifted days always skip; most log rows are `SKIPPED_*`.
- **`asian_session_result` never populated:** Column exists; close path does not write outcome.
- **`positions_closed` never populated:** Close count not tracked in log row.
- **D1 tie-break:** `close <= open` → BEARISH (no doji handling).
- **OANDA required:** `OANDA_API_TOKEN`, `OANDA_ENVIRONMENT` (`practice` or `live`).

---

## 10. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY` | Yes | Service role write access |
| `OANDA_API_TOKEN` | Yes (for D1 fetch) | Prior D1 candle |
| `OANDA_ENVIRONMENT` | No (default `practice`) | OANDA base URL |
| `TELEGRAM_BOT_TOKEN` | No | Open/close alerts |
| `TELEGRAM_CHAT_ID` | No | Alert destination |
