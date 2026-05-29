/**
 * Regime vs AMD direction backtest — clean candle data, no bridge_trade_log.
 * Run: npx tsx scripts/regimeVsAmdDirectionBacktest.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OANDA_API_TOKEN
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeAutoDirectionSnapshot } from '../src/services/amdDetector/amdAutoDirection.js';
import type {
  AmdTag,
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from '../src/services/amdDetector/amdTypes.js';
import { csvEscape } from './amdBackfillCsv.js';
import {
  computeRegimeAt1031,
  regimeToTradeDirection,
} from './regimeVsAmd/regimeAt1031.js';
import {
  isDirectionCorrect,
  peakPipsForPredicted,
  walkDistributionCandles,
  type M5Bar,
} from './regimeVsAmd/regimeVsAmdM5Walk.js';
import { printSummary, type BacktestCsvRow } from './regimeVsAmd/regimeVsAmdSummary.js';

dotenv.config();

const PAIR = 'AUD_USD';
const OANDA_DELAY_MS = 300;
const MIN_M5_BARS = 70;

const CSV_HEADERS = [
  'date',
  'amd_tag',
  'judas_direction',
  'amd_predicted',
  'amd_stored',
  'regime_predicted',
  'regime_confidence',
  'l4',
  'l5',
  'l5_effective',
  'layer6_position_pct',
  'regime_choppy_extended',
  'actual_direction',
  'net_pips',
  'peak_pips',
  'regime_correct',
  'amd_correct',
  'both_agree',
  'both_wrong',
  'fetch_status',
  'candle_count',
  'auto_direction_reason',
] as const;

type AmdDbRow = {
  trade_date: string;
  amd_tag: string;
  judas_direction: string | null;
  reversal_confirmed: boolean | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  layer4_bullish_count_7: number | null;
  layer4_bearish_count_7: number | null;
  daily_bias_alignment: string | null;
  judas_pips: number | null;
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  auto_direction: string | null;
  m5_vs_judas_direction: string | null;
};

type M5DbRow = {
  trade_date: string;
  candles: M5Bar[];
  candle_count: number;
  fetch_status: string;
};

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service role key');
  return createClient(url, key);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapAmdTag(raw: string): AmdTag {
  const allowed: AmdTag[] = [
    'AMD_TEXTBOOK',
    'AMD_COMPRESSION_BREAKOUT',
    'AMD_FAILED',
    'AMD_SHIFTED',
    'AMD_NONE',
    'INSUFFICIENT_DATA',
  ];
  return allowed.includes(raw as AmdTag) ? (raw as AmdTag) : 'AMD_NONE';
}

function mapLayer4(raw: string | null): Layer4D1Bias {
  if (raw === 'TRENDING_UP' || raw === 'TRENDING_DOWN' || raw === 'RANGING') return raw;
  return null;
}

function mapJudas(raw: string | null): JudasDirection | null {
  if (raw === 'UP' || raw === 'DOWN' || raw === 'FLAT') return raw;
  return null;
}

function mapAlignment(raw: string | null): DailyBiasAlignment {
  if (raw === 'ALIGNED' || raw === 'CONFLICTED' || raw === 'RANGING') return raw;
  return null;
}

function mapM5VsJudas(
  raw: string | null
): 'WITH_JUDAS' | 'AGAINST_JUDAS' | 'NEUTRAL' | null {
  if (raw === 'WITH_JUDAS' || raw === 'AGAINST_JUDAS' || raw === 'NEUTRAL') return raw;
  return null;
}

function computeAmdPredicted(amdRow: AmdDbRow): string {
  const snap = computeAutoDirectionSnapshot(
    mapAmdTag(amdRow.amd_tag),
    mapJudas(amdRow.judas_direction),
    mapLayer4(amdRow.layer4_d1_bias),
    amdRow.layer4_bullish_count,
    amdRow.layer4_bearish_count,
    amdRow.layer4_bullish_count_7,
    amdRow.layer4_bearish_count_7,
    mapAlignment(amdRow.daily_bias_alignment),
    amdRow.reversal_confirmed,
    amdRow.judas_pips,
    mapM5VsJudas(amdRow.m5_vs_judas_direction),
    amdRow.asian_range_pips,
    amdRow.asian_net_pips
  );
  return snap.auto_direction;
}

function buildCsvRow(
  amdRow: AmdDbRow,
  m5Row: M5DbRow,
  regimeBlock: Awaited<ReturnType<typeof computeRegimeAt1031>>
): BacktestCsvRow & Record<string, string | number | boolean | null> {
  const walk = walkDistributionCandles(m5Row.candles);
  const amdPredicted = computeAmdPredicted(amdRow);
  const regimeDir = regimeBlock
    ? regimeToTradeDirection(regimeBlock.regime.direction)
    : 'pause';
  const regimePeak = peakPipsForPredicted(regimeDir, walk);
  const amdPeak = peakPipsForPredicted(
    amdPredicted as 'long' | 'short' | 'neutral',
    walk
  );

  const regimeOk = isDirectionCorrect(regimeDir, walk.actualDirection);
  const amdOk = isDirectionCorrect(
    amdPredicted as 'long' | 'short' | 'neutral',
    walk.actualDirection
  );

  const regimeDirPred = regimeDir;
  const bothAgree =
    (regimeDir === 'long' || regimeDir === 'short') &&
    (amdPredicted === 'long' || amdPredicted === 'short') &&
    regimeDir === amdPredicted;

  const bothWrong =
    regimeOk === false &&
    amdOk === false &&
    regimeDir !== 'pause' &&
    (amdPredicted === 'long' || amdPredicted === 'short');

  return {
    date: amdRow.trade_date,
    amd_tag: amdRow.amd_tag,
    judas_direction: amdRow.judas_direction ?? '',
    amd_predicted: amdPredicted,
    amd_stored: amdRow.auto_direction ?? '',
    regime_predicted: regimeDirPred,
    regime_confidence: regimeBlock?.regime.confidence ?? '',
    l4: regimeBlock?.layer4 ?? '',
    l5: regimeBlock?.layer5 ?? '',
    l5_effective: regimeBlock?.layer5Effective ?? '',
    layer6_position_pct: regimeBlock?.layer6PositionPct ?? '',
    regime_choppy_extended: regimeBlock?.regime.choppyExtendedOverride ? 'true' : 'false',
    actual_direction: walk.actualDirection,
    net_pips: walk.netPips,
    peak_pips: regimePeak ?? amdPeak ?? '',
    regime_correct: regimeOk === null ? '' : String(regimeOk),
    amd_correct: amdOk === null ? '' : String(amdOk),
    both_agree: String(bothAgree),
    both_wrong: String(bothWrong),
    fetch_status: m5Row.fetch_status,
    candle_count: m5Row.candle_count,
    auto_direction_reason: '',
  };
}

async function loadAmdRows(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('amd_state')
    .select(
      'trade_date, amd_tag, judas_direction, reversal_confirmed, layer4_d1_bias, ' +
        'layer4_bullish_count, layer4_bearish_count, layer4_bullish_count_7, ' +
        'layer4_bearish_count_7, daily_bias_alignment, judas_pips, asian_range_pips, ' +
        'asian_net_pips, auto_direction, m5_vs_judas_direction'
    )
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });

  if (error) throw new Error(`amd_state: ${error.message}`);
  return (data ?? []) as AmdDbRow[];
}

async function loadM5Map(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count, fetch_status')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .gte('candle_count', MIN_M5_BARS);

  if (error) throw new Error(`amd_m5_distribution_candles: ${error.message}`);

  const map = new Map<string, M5DbRow>();
  for (const row of data ?? []) {
    map.set(row.trade_date as string, row as M5DbRow);
  }
  return map;
}

function writeCsv(rows: Array<Record<string, string | number | boolean | null>>): string {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'regime_vs_amd_direction_backtest.csv');
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((col) => csvEscape(row[col])).join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

async function main(): Promise<void> {
  const supabase = buildSupabase();
  const amdRows = await loadAmdRows(supabase);
  const m5Map = await loadM5Map(supabase);

  console.log(`[RegimeVsAmd] amd_state rows: ${amdRows.length}`);
  console.log(`[RegimeVsAmd] M5 success rows (>=${MIN_M5_BARS} bars): ${m5Map.size}`);

  const csvRows: Array<Record<string, string | number | boolean | null>> = [];
  let skippedNoM5 = 0;
  let skippedRegime = 0;

  for (let index = 0; index < amdRows.length; index++) {
    const amdRow = amdRows[index]!;
    const m5Row = m5Map.get(amdRow.trade_date);
    if (!m5Row?.candles?.length) {
      skippedNoM5++;
      continue;
    }

    if ((index + 1) % 25 === 0) {
      console.log(`[RegimeVsAmd] OANDA regime fetch ${index + 1}/${amdRows.length}…`);
    }

    const regimeBlock = await computeRegimeAt1031(amdRow.trade_date);
    await sleep(OANDA_DELAY_MS);

    if (!regimeBlock) {
      skippedRegime++;
      continue;
    }

    const snap = computeAutoDirectionSnapshot(
      mapAmdTag(amdRow.amd_tag),
      mapJudas(amdRow.judas_direction),
      mapLayer4(amdRow.layer4_d1_bias),
      amdRow.layer4_bullish_count,
      amdRow.layer4_bearish_count,
      amdRow.layer4_bullish_count_7,
      amdRow.layer4_bearish_count_7,
      mapAlignment(amdRow.daily_bias_alignment),
      amdRow.reversal_confirmed,
      amdRow.judas_pips,
      mapM5VsJudas(amdRow.m5_vs_judas_direction),
      amdRow.asian_range_pips,
      amdRow.asian_net_pips
    );

    const built = buildCsvRow(amdRow, m5Row, regimeBlock);
    built.auto_direction_reason = snap.auto_direction_reason;
    csvRows.push(built);
  }

  const outPath = writeCsv(csvRows);
  printSummary(csvRows as BacktestCsvRow[]);

  console.log(`\n[RegimeVsAmd] Joined days written: ${csvRows.length}`);
  console.log(`[RegimeVsAmd] Skipped (no M5): ${skippedNoM5}`);
  console.log(`[RegimeVsAmd] Skipped (regime OANDA insufficient): ${skippedRegime}`);
  console.log(`[RegimeVsAmd] CSV: ${outPath}`);
}

main().catch((runErr) => {
  console.error('[RegimeVsAmd] Fatal:', runErr);
  process.exitCode = 1;
});
