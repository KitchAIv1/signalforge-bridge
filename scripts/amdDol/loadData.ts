import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../../src/connectors/oanda.js';
import type { M5Bar } from '../regimeVsAmd/regimeVsAmdM5Walk.js';
import type {
  AmdDolJoinedRow,
  AsianCleanTrendJoin,
  JoinLoadStats,
} from './types.js';

const PAIR = 'AUD_USD';
const MIN_M5_BARS = 60;
const MAY_29_DATE = '2026-05-29';

export function buildSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('[Dol] Missing Supabase env');
  return createClient(url, key);
}

export async function loadJoinedCohort(
  supabaseDb: SupabaseClient,
  m5Overrides: Map<string, M5Bar[]> = new Map()
): Promise<{ rows: AmdDolJoinedRow[]; stats: JoinLoadStats }> {
  const [m5Map, cleanTrendMap] = await Promise.all([
    loadM5Map(supabaseDb),
    loadCleanTrendMap(supabaseDb),
  ]);
  for (const [tradeDate, candles] of m5Overrides) m5Map.set(tradeDate, candles);
  return buildJoinedRows(supabaseDb, m5Map, cleanTrendMap);
}

export async function maybeFetchMay29M5(
  supabaseDb: SupabaseClient
): Promise<Map<string, M5Bar[]>> {
  const overrides = new Map<string, M5Bar[]>();
  if (!(await hasAmdStateDate(supabaseDb, MAY_29_DATE))) return overrides;
  if (await hasStoredM5Date(supabaseDb, MAY_29_DATE)) return overrides;
  const candles = await fetchM5Distribution(MAY_29_DATE);
  if (candles.length >= MIN_M5_BARS) overrides.set(MAY_29_DATE, candles);
  console.log(
    `[Dol] May 29 M5 ${candles.length >= MIN_M5_BARS ? 'included from OANDA memory fetch' : 'excluded'} ` +
      `(candles=${candles.length})`
  );
  return overrides;
}

async function loadM5Map(
  supabaseDb: SupabaseClient
): Promise<Map<string, M5Bar[]>> {
  const response = await supabaseDb
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count, fetch_status')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .gte('candle_count', MIN_M5_BARS);
  if (response.error) throw new Error(response.error.message);
  const candleMap = new Map<string, M5Bar[]>();
  for (const row of response.data ?? []) {
    candleMap.set(row.trade_date as string, (row.candles ?? []) as M5Bar[]);
  }
  return candleMap;
}

async function loadCleanTrendMap(
  supabaseDb: SupabaseClient
): Promise<Map<string, AsianCleanTrendJoin>> {
  const response = await supabaseDb
    .from('asian_clean_trend_analysis')
    .select('trade_date, prior_d1_direction, prior_d1_body_pips, prior_d1_range_pips, weekly_open_bias');
  if (response.error) throw new Error(response.error.message);
  const cleanTrendMap = new Map<string, AsianCleanTrendJoin>();
  for (const row of response.data ?? []) {
    cleanTrendMap.set(row.trade_date as string, row as AsianCleanTrendJoin);
  }
  return cleanTrendMap;
}

async function buildJoinedRows(
  supabaseDb: SupabaseClient,
  m5Map: Map<string, M5Bar[]>,
  cleanTrendMap: Map<string, AsianCleanTrendJoin>
): Promise<{ rows: AmdDolJoinedRow[]; stats: JoinLoadStats }> {
  const response = await supabaseDb
    .from('amd_state')
    .select(
      'trade_date, amd_tag, daily_bias_alignment, auto_direction, amd_outcome_tag, ' +
        'layer4_d1_bias, layer4_bullish_count, layer4_bearish_count, ' +
        'layer4_d1_bias_7, layer4_bullish_count_7, layer4_bearish_count_7, ' +
        'm5_vs_judas_direction, judas_direction, judas_pips, judas_extreme_price, ' +
        'asian_range_pips, asian_is_flat, chart_data'
    )
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });
  if (response.error) throw new Error(response.error.message);
  return joinRows(response.data ?? [], m5Map, cleanTrendMap);
}

function joinRows(
  amdRows: Array<Record<string, unknown>>,
  m5Map: Map<string, M5Bar[]>,
  cleanTrendMap: Map<string, AsianCleanTrendJoin>
): { rows: AmdDolJoinedRow[]; stats: JoinLoadStats } {
  const stats = initialStats(amdRows.length, m5Map.size, cleanTrendMap.size);
  const rows: AmdDolJoinedRow[] = [];
  for (const amdRow of amdRows) appendJoinedRow(amdRow, m5Map, cleanTrendMap, rows, stats);
  stats.cohortRows = rows.length;
  return { rows, stats };
}

function appendJoinedRow(
  amdRow: Record<string, unknown>,
  m5Map: Map<string, M5Bar[]>,
  cleanTrendMap: Map<string, AsianCleanTrendJoin>,
  rows: AmdDolJoinedRow[],
  stats: JoinLoadStats
): void {
  const tradeDate = amdRow.trade_date as string;
  const m5Candles = m5Map.get(tradeDate);
  if (!m5Candles?.length) {
    stats.skippedNoM5 += 1;
    return;
  }
  const cleanTrend = cleanTrendMap.get(tradeDate) ?? null;
  if (cleanTrend) stats.cleanTrendMatched += 1;
  else stats.cleanTrendMissingDates.push(tradeDate);
  if (amdRow.amd_tag === 'INSUFFICIENT_DATA') {
    stats.insufficientDataExcluded += 1;
    stats.insufficientDataDates.push(tradeDate);
  }
  rows.push(buildJoinedRow(amdRow, m5Candles, cleanTrend));
}

function buildJoinedRow(
  amdRow: Record<string, unknown>,
  m5Candles: M5Bar[],
  cleanTrend: AsianCleanTrendJoin | null
): AmdDolJoinedRow {
  return {
    trade_date: amdRow.trade_date as string,
    amd_tag: amdRow.amd_tag as string | null,
    daily_bias_alignment: amdRow.daily_bias_alignment as string | null,
    auto_direction: amdRow.auto_direction as string | null,
    amd_outcome_tag: amdRow.amd_outcome_tag as string | null,
    layer4_d1_bias: amdRow.layer4_d1_bias as string | null,
    layer4_bullish_count: amdRow.layer4_bullish_count as number | null,
    layer4_bearish_count: amdRow.layer4_bearish_count as number | null,
    layer4_d1_bias_7: amdRow.layer4_d1_bias_7 as string | null,
    layer4_bullish_count_7: amdRow.layer4_bullish_count_7 as number | null,
    layer4_bearish_count_7: amdRow.layer4_bearish_count_7 as number | null,
    m5_vs_judas_direction: amdRow.m5_vs_judas_direction as string | null,
    judas_direction: amdRow.judas_direction as string | null,
    judas_pips: amdRow.judas_pips as number | null,
    judas_extreme_price: amdRow.judas_extreme_price as number | null,
    asian_range_pips: amdRow.asian_range_pips as number | null,
    asian_is_flat: amdRow.asian_is_flat as boolean | null,
    chart_data: amdRow.chart_data as Record<string, unknown> | null,
    m5Candles,
    cleanTrend,
  };
}

function initialStats(
  amdStateTotal: number,
  m5SuccessMapSize: number,
  cleanTrendMapSize: number
): JoinLoadStats {
  return {
    amdStateTotal,
    m5SuccessMapSize,
    cleanTrendMapSize,
    cohortRows: 0,
    cleanTrendMatched: 0,
    cleanTrendMissingDates: [],
    skippedNoM5: 0,
    insufficientDataExcluded: 0,
    insufficientDataDates: [],
  };
}

async function hasAmdStateDate(
  supabaseDb: SupabaseClient,
  tradeDate: string
): Promise<boolean> {
  const response = await supabaseDb
    .from('amd_state')
    .select('trade_date')
    .eq('pair', PAIR)
    .eq('trade_date', tradeDate)
    .limit(1);
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? []).length > 0;
}

async function hasStoredM5Date(
  supabaseDb: SupabaseClient,
  tradeDate: string
): Promise<boolean> {
  const response = await supabaseDb
    .from('amd_m5_distribution_candles')
    .select('trade_date, candle_count, fetch_status')
    .eq('pair', PAIR)
    .eq('trade_date', tradeDate)
    .eq('fetch_status', 'success')
    .gte('candle_count', MIN_M5_BARS)
    .limit(1);
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? []).length > 0;
}

async function fetchM5Distribution(tradeDate: string): Promise<M5Bar[]> {
  try {
    const rawCandles = await fetchCompletedCandles(
      PAIR,
      'M5',
      `${tradeDate}T10:00:00.000000000Z`,
      `${tradeDate}T16:00:00.000000000Z`
    );
    return rawCandles.map((candle) => ({
      time: candle.time,
      o: candle.mid.o,
      h: candle.mid.h,
      l: candle.mid.l,
      c: candle.mid.c,
    }));
  } catch (error) {
    console.warn(`[Dol] May 29 M5 backfetch failed: ${messageFor(error)}`);
    return [];
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
