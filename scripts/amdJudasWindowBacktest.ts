/**
 * Judas window + Asian breach backtest — chart_data + M5 only (no OANDA).
 * Run: npx tsx scripts/amdJudasWindowBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { csvEscape } from './amdBackfillCsv.js';
import { asianWickExtremes, computeVSweepMetrics } from './amdJudasWindow/asianExtremes.js';
import { evaluateAsianBreach } from './amdJudasWindow/asianBreach.js';
import {
  ASIAN_UTC_HOURS,
  chartEntryToOhlc,
  filterCandlesByUtcHours,
  readOhlcFromChart,
} from './amdJudasWindow/chartOhlc.js';
import {
  detectJudasForWindow,
  type JudasWindowVariant,
} from './amdJudasWindow/judasDetect.js';
import { isPotentialLondonFixDay } from './amdJudasWindow/londonFixFlag.js';
import { scoreJudasPeakOutcome } from './amdJudasWindow/peakMetrics.js';
import { printJudasWindowSummary, type BacktestCsvRow } from './amdJudasWindow/summaryReport.js';
import { classifyTagWithBreachGate } from './amdJudasWindow/tagWithBreach.js';
import type { M5Bar } from './regimeVsAmd/regimeVsAmdM5Walk.js';

dotenv.config();

const PAIR = 'AUD_USD';
const MIN_M5_BARS = 36;
const VARIANTS: JudasWindowVariant[] = ['current', 'narrow', 'tight'];

const CSV_HEADERS = [
  'trade_date',
  'amd_tag',
  'asian_range_pips',
  'asian_high_price',
  'asian_low_price',
  'asian_internal_swing',
  'asian_recovery_pct',
  'is_v_sweep',
  'judas_current_direction',
  'judas_current_pips',
  'judas_current_breach',
  'judas_current_correct',
  'judas_narrow_direction',
  'judas_narrow_pips',
  'judas_narrow_breach',
  'judas_narrow_correct',
  'judas_tight_direction',
  'judas_tight_pips',
  'judas_tight_breach',
  'judas_tight_correct',
  'tag_current',
  'tag_window_current',
  'tag_narrow',
  'tag_tight',
  'peak_favorable_current',
  'peak_favorable_narrow',
  'peak_favorable_tight',
  'peak_counter_current',
  'peak_counter_narrow',
  'peak_counter_tight',
  'is_london_fix_day',
  'net_pips_distribution',
] as const;

type AmdDbRow = {
  trade_date: string;
  amd_tag: string;
  asian_range_pips: number | null;
  asian_is_flat: boolean | null;
  chart_data: Record<string, unknown> | null;
};

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service key');
  return createClient(url, key);
}

function boolCell(value: boolean | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

function buildDayRow(
  amdRow: AmdDbRow,
  m5Candles: M5Bar[]
): BacktestCsvRow | null {
  const chartEntries = readOhlcFromChart(amdRow.chart_data);
  if (chartEntries.length < 8) return null;

  const allOhlc = chartEntries.map(chartEntryToOhlc);
  const asianCandles = filterCandlesByUtcHours(chartEntries, ASIAN_UTC_HOURS);
  const asianPrices = asianWickExtremes(asianCandles);
  const vSweep = computeVSweepMetrics(asianCandles);
  const fixFlag = isPotentialLondonFixDay(m5Candles);

  const csvRow: BacktestCsvRow = {
    trade_date: amdRow.trade_date,
    amd_tag: amdRow.amd_tag,
    asian_range_pips: amdRow.asian_range_pips ?? '',
    asian_high_price: asianPrices?.asianHighPrice ?? '',
    asian_low_price: asianPrices?.asianLowPrice ?? '',
    asian_internal_swing: vSweep?.asianInternalSwingPips ?? '',
    asian_recovery_pct: vSweep?.asianRecoveryPct ?? '',
    is_v_sweep: vSweep?.isVSweep ?? false,
    tag_current: amdRow.amd_tag,
    is_london_fix_day: fixFlag,
    net_pips_distribution: '',
  };

  let netPips = '';

  for (const variant of VARIANTS) {
    const detection = detectJudasForWindow(
      allOhlc,
      variant,
      amdRow.asian_range_pips,
      amdRow.asian_is_flat ?? false
    );
    const breach = evaluateAsianBreach(
      detection.judasDirection,
      detection.judasExtremePrice,
      asianPrices
    );
    const tag = classifyTagWithBreachGate(detection, breach);
    const peak = scoreJudasPeakOutcome(m5Candles, detection.judasDirection);

    csvRow[`judas_${variant}_direction`] = detection.judasDirection ?? '';
    csvRow[`judas_${variant}_pips`] = detection.judasPips ?? '';
    csvRow[`judas_${variant}_breach`] = breach.breachesAsianRange;
    csvRow[`judas_${variant}_correct`] = peak?.judasCorrect ?? '';

    if (variant === 'current') {
      csvRow.tag_window_current = tag;
      csvRow.peak_favorable_current = peak?.peakFavorableJudasPips ?? '';
      csvRow.peak_counter_current = peak?.peakFavorableCounterPips ?? '';
      netPips = String(peak?.netPipsDistribution ?? '');
    } else if (variant === 'narrow') {
      csvRow.tag_narrow = tag;
      csvRow.peak_favorable_narrow = peak?.peakFavorableJudasPips ?? '';
      csvRow.peak_counter_narrow = peak?.peakFavorableCounterPips ?? '';
    } else {
      csvRow.tag_tight = tag;
      csvRow.peak_favorable_tight = peak?.peakFavorableJudasPips ?? '';
      csvRow.peak_counter_tight = peak?.peakFavorableCounterPips ?? '';
    }
  }

  csvRow.net_pips_distribution = netPips;
  return csvRow;
}

async function loadM5Map(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, M5Bar[]>> {
  const { data, error } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count, fetch_status')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .gte('candle_count', MIN_M5_BARS);
  if (error) throw new Error(error.message);
  const map = new Map<string, M5Bar[]>();
  for (const row of data ?? []) {
    map.set(row.trade_date as string, (row.candles ?? []) as M5Bar[]);
  }
  return map;
}

function writeCsv(rows: BacktestCsvRow[]): string {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'amd_judas_window_backtest.csv');
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      CSV_HEADERS.map((col) => {
        const value = row[col];
        if (typeof value === 'boolean') return boolCell(value);
        return csvEscape(value);
      }).join(',')
    );
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

async function main(): Promise<void> {
  const supabase = buildSupabase();
  const { data, error } = await supabase
    .from('amd_state')
    .select('trade_date, amd_tag, asian_range_pips, asian_is_flat, chart_data')
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });
  if (error) throw new Error(error.message);

  const amdRows = (data ?? []) as AmdDbRow[];
  const m5Map = await loadM5Map(supabase);
  const csvRows: BacktestCsvRow[] = [];
  let skippedNoChart = 0;
  let skippedNoM5 = 0;

  for (const amdRow of amdRows) {
    if (!amdRow.chart_data) {
      skippedNoChart += 1;
      continue;
    }
    const m5 = m5Map.get(amdRow.trade_date);
    if (!m5?.length) {
      skippedNoM5 += 1;
      continue;
    }
    const built = buildDayRow(amdRow, m5);
    if (built) csvRows.push(built);
    else skippedNoChart += 1;
  }

  const outPath = writeCsv(csvRows);
  printJudasWindowSummary(csvRows);

  console.log(`\n[JudasWindow] amd_state rows: ${amdRows.length}`);
  console.log(`[JudasWindow] M5 success map size: ${m5Map.size}`);
  console.log(`[JudasWindow] Analyzed (chart + M5): ${csvRows.length}`);
  console.log(`[JudasWindow] Skipped no chart_data/ohlc: ${skippedNoChart}`);
  console.log(`[JudasWindow] Skipped no M5: ${skippedNoM5}`);
  console.log(`[JudasWindow] CSV: ${outPath}`);
}

main().catch((runErr) => {
  console.error('[JudasWindow] Fatal:', runErr);
  process.exitCode = 1;
});
