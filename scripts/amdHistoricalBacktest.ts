/**
 * AMD Historical Backtest — 1 year AUDUSD H1 AMD detection.
 * Processes every trading day for the past year.
 * Writes to amd_state (upsert) + CSV files.
 * Safe to re-run — skips already-processed dates.
 *
 * Run: npm run amd-historical
 * Rebuild CSVs from DB (no OANDA): npm run amd-historical-csv
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   OANDA_API_TOKEN, OANDA_ENVIRONMENT
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../src/connectors/oanda.js';
import { computeDateFeatures, type OhlcCandle } from '../src/services/amdDetector/amdFeatures.js';
import { buildAmdChartDataPayload } from '../src/services/amdDetector/amdChartPayload.js';
import type { AmdDateFeatures } from '../src/services/amdDetector/amdTypes.js';
import { average, csvEscape } from './amdBackfillCsv.ts';

const INSTRUMENT = 'AUD_USD';
const OANDA_GAP_MS = 600;
const BACKTEST_START = '2025-05-01'; // earliest confirmed OANDA practice history
const PROGRESS_INTERVAL = 20;

type D1BiasResult = {
  layer4_d1_bias: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
};

function buildHistoricalSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[AmdHistorical] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchWindowForDate(dateKey: string): { fromISO: string; toISO: string } {
  // Historical backtest uses full distribution window 00:00-16:30 UTC
  // This ensures hours 10-13 distribution candles are available
  // for reversal_confirmed computation.
  // NOTE: Live detector uses amdH1FetchWindow (early cutoff for intraday advisory)
  // — this file intentionally extends history for fuller distribution candles.
  return {
    fromISO: `${dateKey}T00:00:00.000000000Z`,
    toISO: `${dateKey}T16:30:00.000000000Z`,
  };
}

function countTrendVotesFromFiveD1Bars(
  lastFiveBars: ReadonlyArray<{ mid: { o: string; c: string } }>,
): { bullishCount: number; bearishCount: number } {
  let bullishCount = 0;
  let bearishCount = 0;
  for (const candleEntry of lastFiveBars) {
    const openPx = parseFloat(candleEntry.mid.o);
    const closePx = parseFloat(candleEntry.mid.c);
    if (!Number.isFinite(openPx) || !Number.isFinite(closePx)) continue;
    if (closePx > openPx) bullishCount++;
    else if (openPx > closePx) bearishCount++;
  }
  return { bullishCount, bearishCount };
}

async function fetchD1BiasForDate(dateKey: string): Promise<D1BiasResult> {
  const emptyBias: D1BiasResult = {
    layer4_d1_bias: null,
    layer4_bullish_count: null,
    layer4_bearish_count: null,
  };
  try {
    const tradeDateMs = Date.parse(`${dateKey}T00:00:00.000Z`);
    const rangeStartUtc = new Date(tradeDateMs - 14 * 24 * 3600 * 1000);
    const fromISO =
      rangeStartUtc.toISOString().split('T')[0] + 'T00:00:00.000000000Z';
    const toISO = `${dateKey}T00:00:00.000000000Z`;
    const d1Bars = await fetchCompletedCandles(INSTRUMENT, 'D', fromISO, toISO);
    const last5 = d1Bars.slice(-5);

    if (last5.length === 0) return emptyBias;

    const { bullishCount, bearishCount } = countTrendVotesFromFiveD1Bars(last5);
    const layer4_d1_bias =
      bullishCount >= 3
        ? 'TRENDING_UP'
        : bearishCount >= 3
          ? 'TRENDING_DOWN'
          : 'RANGING';

    return {
      layer4_d1_bias,
      layer4_bullish_count: bullishCount,
      layer4_bearish_count: bearishCount,
    };
  } catch (biasErr: unknown) {
    console.warn(
      `[AmdHistorical] ${dateKey} — D1 bias fetch failed:`,
      biasErr instanceof Error ? biasErr.message : biasErr,
    );
    return emptyBias;
  }
}

function computeBiasAlignment(
  judasDirection: string | null,
  layer4_d1_bias: string | null,
): 'ALIGNED' | 'CONFLICTED' | 'RANGING' | null {
  if (!judasDirection || judasDirection === 'FLAT') return null;
  if (!layer4_d1_bias) return null;
  if (layer4_d1_bias === 'RANGING') return 'RANGING';
  if (judasDirection === 'UP') {
    if (layer4_d1_bias === 'TRENDING_DOWN') return 'ALIGNED';
    if (layer4_d1_bias === 'TRENDING_UP') return 'CONFLICTED';
  }
  if (judasDirection === 'DOWN') {
    if (layer4_d1_bias === 'TRENDING_UP') return 'ALIGNED';
    if (layer4_d1_bias === 'TRENDING_DOWN') return 'CONFLICTED';
  }
  return null;
}

function toUtcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function generateTradingDays(): string[] {
  const days: string[] = [];

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(BACKTEST_START + 'T00:00:00.000000000Z');

  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.push(toUtcDateKey(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

async function fetchH1CandlesForDate(dateKey: string): Promise<OhlcCandle[]> {
  try {
    const { fromISO, toISO } = fetchWindowForDate(dateKey);
    const raw = await fetchCompletedCandles(INSTRUMENT, 'H1', fromISO, toISO);
    return raw as OhlcCandle[];
  } catch (fetchErr: unknown) {
    console.warn(
      `[AmdHistorical] ${dateKey} — OANDA fetch failed:`,
      fetchErr instanceof Error ? fetchErr.message : fetchErr
    );
    return [];
  }
}

function insufficientAmdFeatures(): AmdDateFeatures {
  return {
    asian_range_pips: null,
    asian_net_pips: null,
    asian_is_flat: false,
    judas_direction: null,
    judas_pips: null,
    reversal_confirmed: null,
    compression_breakout: false,
    delayed_distribution: false,
    amd_tag: 'INSUFFICIENT_DATA',
    judas_extreme_price: null,
  };
}

type UpsertAmdOpts = {
  supabase: ReturnType<typeof buildHistoricalSupabaseClient>;
  dateKey: string;
  evaluatedAt: string;
  candles: OhlcCandle[];
  features: AmdDateFeatures;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  daily_bias_alignment: string | null;
};

async function upsertAmdHistoricalRow(opts: UpsertAmdOpts): Promise<void> {
  const chartPayload = buildAmdChartDataPayload(opts.dateKey, opts.candles, opts.features);

  const { error } = await opts.supabase.from('amd_state').upsert(
    {
      trade_date: opts.dateKey,
      evaluated_at: opts.evaluatedAt,
      pair: INSTRUMENT,
      asian_range_pips: opts.features.asian_range_pips,
      asian_net_pips: opts.features.asian_net_pips,
      asian_is_flat: opts.features.asian_is_flat,
      judas_direction: opts.features.judas_direction,
      judas_pips: opts.features.judas_pips,
      judas_extreme_price: opts.features.judas_extreme_price,
      reversal_confirmed: opts.features.reversal_confirmed,
      compression_breakout: opts.features.compression_breakout,
      delayed_distribution: opts.features.delayed_distribution,
      amd_tag: opts.features.amd_tag,
      layer4_d1_bias: opts.layer4_d1_bias,
      layer4_bullish_count: opts.layer4_bullish_count,
      layer4_bearish_count: opts.layer4_bearish_count,
      daily_bias_alignment: opts.daily_bias_alignment,
      chart_url: null,
      chart_generated_at: null,
      chart_data: chartPayload,
    },
    { onConflict: 'trade_date,pair' }
  );

  if (error) {
    console.warn(`[AmdHistorical] ${opts.dateKey} — upsert failed:`, error.message);
  }
}

type HistoricalRow = {
  trade_date: string;
  amd_tag: string;
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  asian_is_flat: boolean;
  judas_direction: string | null;
  judas_pips: number | null;
  reversal_confirmed: boolean | null;
  compression_breakout: boolean;
  delayed_distribution: boolean;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  daily_bias_alignment: string | null;
};

function writeHistoricalCsvs(rows: HistoricalRow[], outDir: string): void {
  const detailHeader = [
    'trade_date',
    'amd_tag',
    'asian_range_pips',
    'asian_net_pips',
    'asian_is_flat',
    'judas_direction',
    'judas_pips',
    'reversal_confirmed',
    'compression_breakout',
    'delayed_distribution',
    'layer4_d1_bias',
    'layer4_bullish_count',
    'layer4_bearish_count',
    'daily_bias_alignment',
  ].join(',');

  const detailLines = [detailHeader];
  for (const r of rows) {
    detailLines.push(
      [
        csvEscape(r.trade_date),
        csvEscape(r.amd_tag),
        csvEscape(r.asian_range_pips),
        csvEscape(r.asian_net_pips),
        csvEscape(r.asian_is_flat),
        csvEscape(r.judas_direction),
        csvEscape(r.judas_pips),
        csvEscape(r.reversal_confirmed),
        csvEscape(r.compression_breakout),
        csvEscape(r.delayed_distribution),
        csvEscape(r.layer4_d1_bias ?? ''),
        r.layer4_bullish_count ?? '',
        r.layer4_bearish_count ?? '',
        csvEscape(r.daily_bias_alignment ?? ''),
      ].join(',')
    );
  }
  fs.writeFileSync(
    path.join(outDir, 'amd_historical_by_date.csv'),
    detailLines.join('\n'),
    'utf8'
  );

  const tagGroups = new Map<string, HistoricalRow[]>();
  for (const r of rows) {
    const g = tagGroups.get(r.amd_tag) ?? [];
    g.push(r);
    tagGroups.set(r.amd_tag, g);
  }

  const summaryHeader = [
    'amd_tag',
    'n_days',
    'pct_of_total',
    'avg_asian_range',
    'flat_count',
    'reversal_confirmed_count',
    'compression_count',
    'delayed_count',
  ].join(',');

  const summaryLines = [summaryHeader];
  const total = rows.length;

  for (const [tag, group] of [...tagGroups.entries()].sort()) {
    const ranges = group
      .map((row) => row.asian_range_pips)
      .filter((v): v is number => v !== null);
    const avgRange = ranges.length > 0 ? average(ranges).toFixed(1) : '';

    summaryLines.push(
      [
        csvEscape(tag),
        csvEscape(group.length),
        csvEscape(((group.length / total) * 100).toFixed(1) + '%'),
        csvEscape(avgRange),
        csvEscape(group.filter((row) => row.asian_is_flat).length),
        csvEscape(group.filter((row) => row.reversal_confirmed === true).length),
        csvEscape(group.filter((row) => row.compression_breakout).length),
        csvEscape(group.filter((row) => row.delayed_distribution).length),
      ].join(',')
    );
  }

  fs.writeFileSync(
    path.join(outDir, 'amd_historical_summary.csv'),
    summaryLines.join('\n'),
    'utf8'
  );
}

/** Tag counts for diagnostics (stdout only). */
function logTagDistribution(rows: HistoricalRow[], headerLine: string): void {
  if (rows.length === 0) return;
  const tagCounts: Record<string, number> = {};
  for (const row of rows) {
    tagCounts[row.amd_tag] = (tagCounts[row.amd_tag] ?? 0) + 1;
  }
  console.log(headerLine);
  for (const [tagKey, cnt] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((cnt / rows.length) * 100).toFixed(1);
    console.log(`    ${tagKey.padEnd(30)} ${cnt} days (${pct}%)`);
  }
}

type AmdCsvDbRowRead = Record<string, unknown>;

function calendarFilteredHistoricalRows(
  dbRowsRaw: unknown,
  weekdaySet: Set<string>
): HistoricalRow[] {
  const fromDb = (dbRowsRaw as AmdCsvDbRowRead[] | undefined) ?? [];
  return fromDb
    .filter((row) => typeof row.trade_date === 'string' && weekdaySet.has(row.trade_date))
    .map((row) => ({
      trade_date: String(row.trade_date),
      amd_tag: String(row.amd_tag),
      asian_range_pips: row.asian_range_pips as number | null,
      asian_net_pips: row.asian_net_pips as number | null,
      asian_is_flat: Boolean(row.asian_is_flat),
      judas_direction: row.judas_direction == null ? null : String(row.judas_direction),
      judas_pips: row.judas_pips as number | null,
      reversal_confirmed: row.reversal_confirmed as boolean | null,
      compression_breakout: Boolean(row.compression_breakout),
      delayed_distribution: Boolean(row.delayed_distribution),
      layer4_d1_bias: row.layer4_d1_bias == null ? null : String(row.layer4_d1_bias),
      layer4_bullish_count: (row.layer4_bullish_count as number | null) ?? null,
      layer4_bearish_count: (row.layer4_bearish_count as number | null) ?? null,
      daily_bias_alignment:
        row.daily_bias_alignment == null ? null : String(row.daily_bias_alignment),
    }));
}

/** When DB rows exist but CSV export failed, rewrite CSV files from amd_state only. */
export async function emitHistoricalCsvFromDb(): Promise<void> {
  dotenv.config();
  const supabase = buildHistoricalSupabaseClient();
  const weekdayCalendar = generateTradingDays();
  const weekdaySet = new Set(weekdayCalendar);
  const rangeStart = weekdayCalendar[0] ?? BACKTEST_START;
  const rangeEnd = weekdayCalendar[weekdayCalendar.length - 1] ?? rangeStart;

  const { data: dbRows, error: queryError } = await supabase
    .from('amd_state')
    .select(
      [
        'trade_date',
        'amd_tag',
        'asian_range_pips',
        'asian_net_pips',
        'asian_is_flat',
        'judas_direction',
        'judas_pips',
        'reversal_confirmed',
        'compression_breakout',
        'delayed_distribution',
        'layer4_d1_bias',
        'layer4_bullish_count',
        'layer4_bearish_count',
        'daily_bias_alignment',
      ].join(', ')
    )
    .eq('pair', INSTRUMENT)
    .gte('trade_date', rangeStart)
    .lte('trade_date', rangeEnd)
    .order('trade_date', { ascending: true });

  if (queryError) {
    throw new Error(`[AmdHistorical] emit-csv-from-db query failed: ${queryError.message}`);
  }

  const historicalRows = calendarFilteredHistoricalRows(dbRows, weekdaySet);
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('[AmdHistorical] emit-csv-from-db (no OANDA)');
  console.log(`[AmdHistorical] Calendar weekdays in range: ${weekdayCalendar.length}`);
  console.log(`[AmdHistorical] Rows exported (matching calendar): ${historicalRows.length}`);

  if (historicalRows.length === 0) {
    console.warn('[AmdHistorical] Nothing to export — verify amd_state and BACKTEST_START range.');
    return;
  }

  writeHistoricalCsvs(historicalRows, outDir);
  console.log(`\n[AmdHistorical] CSVs written to ${outDir}`);
  console.log('[AmdHistorical] ═══════════════════════════');
  logTagDistribution(
    historicalRows,
    '\n  Tag distribution (calendar window in amd_state):'
  );
  console.log('[AmdHistorical] ═══════════════════════════');
}

export async function runAmdHistoricalBacktest(): Promise<void> {
  dotenv.config();

  const tradingDays = generateTradingDays();
  const supabase = buildHistoricalSupabaseClient();
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const firstDay = tradingDays[0] ?? '—';
  const lastDay = tradingDays[tradingDays.length - 1] ?? '—';

  console.log('[AmdHistorical] Starting 1-year AMD backtest');
  console.log(`[AmdHistorical] Range: ${firstDay} → ${lastDay}`);
  console.log(`[AmdHistorical] Trading days to check: ${tradingDays.length}`);
  console.log(
    `[AmdHistorical] Estimated runtime: ~${Math.ceil(
      (tradingDays.length * OANDA_GAP_MS) / 60000
    )} minutes\n`
  );

  const results: HistoricalRow[] = [];
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < tradingDays.length; i++) {
    const dateKey = tradingDays[i];

    if (i > 0 && i % PROGRESS_INTERVAL === 0) {
      console.log(
        `[AmdHistorical] Progress: ${i}/${tradingDays.length} ` +
          `(${processed} written, ${skipped} skipped, ${failed} failed)`
      );
    }

    const { data: existing, error: checkErr } = await supabase
      .from('amd_state')
      .select('id')
      .eq('trade_date', dateKey)
      .eq('pair', INSTRUMENT)
      .maybeSingle();

    if (checkErr) {
      console.warn(`[AmdHistorical] ${dateKey} — existence check failed:`, checkErr.message);
      failed++;
      continue;
    }

    if (existing) {
      skipped++;
      continue;
    }

    const candles = await fetchH1CandlesForDate(dateKey);
    const evaluatedAt = new Date().toISOString();

    let features: AmdDateFeatures;

    if (candles.length === 0) {
      features = insufficientAmdFeatures();
      console.log(`[AmdHistorical] ${dateKey} | INSUFFICIENT_DATA — no candles`);
    } else {
      features = computeDateFeatures(candles, (badCandle, reason) => {
        console.warn(`[AmdHistorical] ${dateKey} bad candle: ${reason}`, badCandle.time);
      });
    }

    const d1Bias = await fetchD1BiasForDate(dateKey);
    const dailyBiasAlignment = computeBiasAlignment(
      features.judas_direction,
      d1Bias.layer4_d1_bias,
    );

    console.log(
      `[AmdHistorical] ${dateKey} | ${features.amd_tag} | ` +
        `judas=${features.judas_direction ?? '—'} | ` +
        `D1=${d1Bias.layer4_d1_bias ?? '—'} | ` +
        `alignment=${dailyBiasAlignment ?? '—'}`,
    );

    await sleep(400);

    await upsertAmdHistoricalRow({
      supabase,
      dateKey,
      evaluatedAt,
      candles,
      features,
      layer4_d1_bias: d1Bias.layer4_d1_bias,
      layer4_bullish_count: d1Bias.layer4_bullish_count,
      layer4_bearish_count: d1Bias.layer4_bearish_count,
      daily_bias_alignment: dailyBiasAlignment,
    });

    results.push({
      trade_date: dateKey,
      amd_tag: features.amd_tag,
      asian_range_pips: features.asian_range_pips,
      asian_net_pips: features.asian_net_pips,
      asian_is_flat: features.asian_is_flat,
      judas_direction: features.judas_direction,
      judas_pips: features.judas_pips,
      reversal_confirmed: features.reversal_confirmed,
      compression_breakout: features.compression_breakout,
      delayed_distribution: features.delayed_distribution,
      layer4_d1_bias: d1Bias.layer4_d1_bias,
      layer4_bullish_count: d1Bias.layer4_bullish_count,
      layer4_bearish_count: d1Bias.layer4_bearish_count,
      daily_bias_alignment: dailyBiasAlignment,
    });

    processed++;
    await sleep(OANDA_GAP_MS);
  }

  if (results.length > 0) {
    writeHistoricalCsvs(results, outDir);
    console.log(`\n[AmdHistorical] CSVs written to ${outDir}`);
  }

  console.log('\n[AmdHistorical] ═══════════════════════════');
  console.log(`  Total checked:  ${tradingDays.length}`);
  console.log(`  Written:        ${processed}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Failed:         ${failed}`);

  if (results.length > 0) {
    logTagDistribution(results, '\n  Tag distribution (newly processed):');
  }

  console.log('[AmdHistorical] ═══════════════════════════');
}

const scriptPath = process.argv[1] ?? '';
const isMain = scriptPath.includes('amdHistoricalBacktest');

if (isMain) {
  const emitCsvFromDbFlag = process.argv.includes('--emit-csv-from-db');
  const runner = emitCsvFromDbFlag ? emitHistoricalCsvFromDb : runAmdHistoricalBacktest;

  void runner()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('[AmdHistorical] Fatal error:', err);
      process.exit(1);
    });
}
