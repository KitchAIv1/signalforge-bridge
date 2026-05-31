# Asian M5 Candles Service — Reference

**SignalForge / Veredix | May 2026**
**Migration:** `028_asian_m5_candles.sql`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial service reference |

---

## 1. Purpose

Fetches and stores **M5 OHLC candles for the Asian session window (00:00–08:00 UTC)** per trading day. Used by the Asian scalper backtest and daily research. Mirrors the pattern of `amd_m5_distribution_candles` (migration 018) for the distribution window.

---

## 2. Cron Schedule

Registered in `src/index.ts`:

```
5 8 * * 1-5   → fetchTodayAsianCandles()
```

**08:05 UTC Mon–Fri** — runs after Asian session close (08:00 UTC) and after `runAsianSessionClose()` at 08:00.

---

## 3. Input

| Source | Detail |
|--------|--------|
| OANDA API | `fetchCompletedCandles(AUD_USD, M5, fromISO, toISO)` |
| Window | `${tradeDate}T00:00:00.000000000Z` → `${tradeDate}T08:00:00.000000000Z` |
| Pair | `AUD_USD` (constant `ASIAN_M5_PAIR`) |

Retry: 3 attempts, exponential backoff from 1500 ms base.

---

## 4. Output

**Table:** `asian_m5_candles`

| Column | Purpose |
|--------|---------|
| `trade_date` | Trading day (UTC date) |
| `pair` | `AUD_USD` |
| `candles` | JSONB array `{ time, o, h, l, c }` |
| `candle_count` | Length of array |
| `fetch_status` | `success`, `empty`, `error`, `pending` |
| `error_message` | Set on error |
| `fetched_at` | Timestamp of last fetch |

Upsert key: `(trade_date, pair)`.

Expected success count: **96 candles/day** (00:00–07:55 M5 bars; 08:00 bar is session end reference in backtest).

---

## 5. Dependencies

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`)
- `OANDA_API_TOKEN`, `OANDA_ENVIRONMENT`
- Migration 028 applied
- For daily cron: bridge running with network access to OANDA

---

## 6. Failure Modes

| Condition | Behavior |
|-----------|----------|
| OANDA error after 3 retries | `fetch_status = 'error'`, `error_message` set |
| Zero candles returned | `fetch_status = 'empty'` |
| Missing env vars | Throws at client build |
| Weekend/holiday | May return `empty` — backfill logs these dates |

Backfill script skips dates already `success` or `empty` unless `RETRY_ERRORS=true`.

---

## 7. Key Functions

| Function | File | Description |
|----------|------|-------------|
| `fetchTodayAsianCandles()` | `asianM5CandleFetch.ts` | Daily cron entry — fetches today UTC date |
| `fetchAndStoreAsianCandlesForDate(date)` | same | Fetch + upsert one date |
| `fetchAsianCandlesWithRetry(date)` | same | OANDA fetch with retry logic |
| `upsertAsianM5Row(...)` | same | Writes to Supabase |
| `buildAsianFetchWindow(date)` | same | Returns fromISO/toISO for window |

Constants: `src/services/asianM5/asianM5Constants.ts`

---

## 8. Backfill

**Script:** `scripts/asianM5BackfetchFull.ts`

```
npx tsx scripts/asianM5BackfetchFull.ts
```

- Iterates all `amd_state.trade_date` rows for `AUD_USD`
- Skips existing `success` / `empty` rows
- Rate limit: 700 ms between OANDA calls
- Env: `DRY_RUN=true`, `RETRY_ERRORS=true` (optional)

**Migration runner:** `scripts/runMigration028.ts`

---

## 9. Consumers

| Consumer | Usage |
|----------|-------|
| `scripts/asianScalperBacktest.ts` | Reads `asian_m5_candles` where `fetch_status = success` |
| `scripts/asianScalperBacktest/loadCohorts.ts` | Candle map loader |

---

## 10. Related Tables

| Table | Window | Migration |
|-------|--------|-----------|
| `amd_m5_distribution_candles` | 10:00–16:00 UTC | 018 |
| `asian_m5_candles` | 00:00–08:00 UTC | 028 |

Do not cross-use tables — contamination risk.

---

*SERVICE Asian M5 Candles | SignalForge / Veredix | May 2026*
