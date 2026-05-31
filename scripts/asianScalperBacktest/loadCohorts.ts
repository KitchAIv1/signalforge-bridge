import { createClient } from '@supabase/supabase-js';
import type { M5Candle } from '../scalperBacktest/simulateScalp.js';

const PAIR = 'AUD_USD';
const SINCE = '2025-05-01';

export type AsianScalpCohortRow = {
  tradeDate: string;
  direction: 'long' | 'short';
  priorD1Direction: string | null;
  candles: M5Candle[];
};

type AsianDirectionLogRow = {
  trade_date: string;
  direction_set: string | null;
  prior_d1_direction: string | null;
  action: string;
  triggered_at: string;
};

type AmdStateRow = {
  trade_date: string;
  auto_direction: string | null;
};

type CandleRow = {
  trade_date: string;
  candles: M5Candle[];
  fetch_status: string;
};

function buildSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service role key');
  return createClient(url, key);
}

async function fetchAllRows<T>(
  table: string,
  select: string,
  applyFilters: (
    query: ReturnType<ReturnType<typeof createClient>['from']>,
  ) => ReturnType<ReturnType<typeof createClient>['from']>,
): Promise<T[]> {
  const supabase = buildSupabaseClient();
  let offset = 0;
  const pageSize = 1000;
  const rows: T[] = [];

  while (true) {
    let query = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    query = applyFilters(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function latestSetRowPerDay(rows: AsianDirectionLogRow[]): Map<string, AsianDirectionLogRow> {
  const byDate = new Map<string, AsianDirectionLogRow>();
  const sorted = [...rows].sort(
    (a, b) => new Date(a.triggered_at).getTime() - new Date(b.triggered_at).getTime(),
  );
  for (const row of sorted) {
    if (row.direction_set !== 'long' && row.direction_set !== 'short') continue;
    byDate.set(row.trade_date, row);
  }
  return byDate;
}

async function loadAsianCandleMap(): Promise<Map<string, M5Candle[]>> {
  const candleRows = await fetchAllRows<CandleRow>(
    'asian_m5_candles',
    'trade_date, candles, fetch_status',
    (query) => query.eq('pair', PAIR).eq('fetch_status', 'success'),
  );
  const map = new Map<string, M5Candle[]>();
  for (const row of candleRows) {
    map.set(row.trade_date, row.candles ?? []);
  }
  return map;
}

export async function loadCohortA(): Promise<AsianScalpCohortRow[]> {
  const logRows = await fetchAllRows<AsianDirectionLogRow>(
    'asian_direction_log',
    'trade_date, direction_set, prior_d1_direction, action, triggered_at',
    (query) =>
      query
        .in('action', ['SET_LONG', 'SET_SHORT'])
        .not('direction_set', 'is', null)
        .gte('trade_date', SINCE),
  );

  const candleMap = await loadAsianCandleMap();
  const latestByDay = latestSetRowPerDay(logRows);
  const cohort: AsianScalpCohortRow[] = [];

  for (const [tradeDate, row] of latestByDay) {
    const candles = candleMap.get(tradeDate);
    if (!candles?.length) continue;
    cohort.push({
      tradeDate,
      direction: row.direction_set as 'long' | 'short',
      priorD1Direction: row.prior_d1_direction,
      candles,
    });
  }

  return cohort.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

export async function loadCohortB(): Promise<AsianScalpCohortRow[]> {
  const amdRows = await fetchAllRows<AmdStateRow>(
    'amd_state',
    'trade_date, auto_direction',
    (query) =>
      query
        .eq('pair', PAIR)
        .in('auto_direction', ['long', 'short'])
        .gte('trade_date', SINCE),
  );

  const candleMap = await loadAsianCandleMap();
  const cohort: AsianScalpCohortRow[] = [];

  for (const row of amdRows) {
    const candles = candleMap.get(row.trade_date);
    if (!candles?.length) continue;
    if (row.auto_direction !== 'long' && row.auto_direction !== 'short') continue;
    cohort.push({
      tradeDate: row.trade_date,
      direction: row.auto_direction,
      priorD1Direction: null,
      candles,
    });
  }

  return cohort.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}
