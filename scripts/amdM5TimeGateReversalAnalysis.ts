import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import {
  buildSummaries,
  printRuntimeParameters,
  printSummary,
  writeCsvs,
} from './amdM5TimeGateReversalAnalysisHelpers';

/**
 * Known Limitations
 * - Direction is computed locally using computePredictedDirection() from amd_state inputs.
 *   It is not loaded from a persisted model prediction.
 * - Reversal detection can trigger within the same M5 candle that achieved the MFE peak
 *   unless USE_CONSERVATIVE_REVERSAL is enabled.
 * - This script measures price behavior only. It does not model spreads, slippage,
 *   commissions, or live execution.
 * - The analysis only includes days that have a valid AMD prediction.
 */
const PAIR = 'AUD_USD';
const SCRIPT_VERSION = '2026-05-21';
const USE_CONSERVATIVE_REVERSAL = false;
const START_DATE: string | null = null;
const END_DATE: string | null = null;
const PIP_MULTIPLIER = 10000;

const ENTRY_HOURS: Record<string, number> = {
  AMD_TEXTBOOK: 12,
  AMD_COMPRESSION_BREAKOUT: 10,
  AMD_FAILED: 11,
  AMD_SHIFTED: 12,
  AMD_NONE: 10,
};
const EXIT_HOURS: Record<string, number> = {
  AMD_TEXTBOOK: 13,
  AMD_COMPRESSION_BREAKOUT: 13,
  AMD_FAILED: 12,
  AMD_SHIFTED: 13,
  AMD_NONE: 11,
};
const TAGS_TO_ANALYZE = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
] as const;
const REVERSAL_THRESHOLDS = [2.5, 5, 7.5, 10, 12.5, 15] as const;

type AmdTag = (typeof TAGS_TO_ANALYZE)[number];

type M5Candle = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};
type AmdStateRow = {
  trade_date: string;
  amd_tag: string;
  judas_direction: string | null;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  reversal_confirmed: boolean | null;
  asian_range_pips: number | null;
};
type DayData = AmdStateRow & {
  amd_tag: AmdTag;
  predicted_direction: 'UP' | 'DOWN';
  candles: M5Candle[];
};
type ReversalHit = {
  threshold: number;
  hit: boolean;
  bar_index: number | null;
  utc_hour: number | null;
  peak_before_reversal_pips: number | null;
};
type DayResult = {
  trade_date: string;
  amd_tag: AmdTag;
  predicted_direction: 'UP' | 'DOWN';
  daily_bias_alignment: string;
  judas_direction: string;
  reversal_confirmed: string;
  asian_range_bucket: string;
  asian_range_pips: number | null;
  entry_hour: number;
  exit_hour: number;
  reference_price: number;
  bars_in_gate: number;
  mfe_pips: number;
  mfe_bar_index: number;
  mfe_hour: number;
  mae_pips: number;
  mae_bar_index: number;
  mae_hour: number;
  close_pips: number;
  giveback_to_close_pips: number;
  max_giveback_from_peak_pips: number;
  reversals: ReversalHit[];
};

function buildSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[TimeGateReversal] Missing SUPABASE_URL or service key');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function computePredictedDirection(row: AmdStateRow): 'UP' | 'DOWN' | 'NO_PREDICTION' {
  const tag = row.amd_tag;
  const judas = row.judas_direction;

  if (tag === 'AMD_TEXTBOOK' || tag === 'AMD_FAILED') {
    if (judas === 'UP') return 'DOWN';
    if (judas === 'DOWN') return 'UP';
    return 'NO_PREDICTION';
  }

  if (tag === 'AMD_COMPRESSION_BREAKOUT') {
    if (judas === 'UP') return 'UP';
    if (judas === 'DOWN') return 'DOWN';
    return 'NO_PREDICTION';
  }

  if (tag === 'AMD_SHIFTED' || tag === 'AMD_NONE') {
    const alignment = row.daily_bias_alignment;
    if (alignment === 'ALIGNED') {
      if (judas === 'UP') return 'DOWN';
      if (judas === 'DOWN') return 'UP';
      return 'NO_PREDICTION';
    }
    if (alignment === 'CONFLICTED') {
      const d1 = row.layer4_d1_bias;
      if (d1 === 'TRENDING_UP') return 'UP';
      if (d1 === 'TRENDING_DOWN') return 'DOWN';
    }
  }

  return 'NO_PREDICTION';
}

function asianRangeBucket(pips: number | null): string {
  if (pips === null || !Number.isFinite(pips)) return 'UNKNOWN';
  if (pips < 25) return 'LT_25';
  if (pips < 40) return '25_40';
  return 'GTE_40';
}

async function loadDayData(): Promise<DayData[]> {
  const supabase = buildSupabaseClient();
  const { data: amdRows, error: amdErr } = await supabase
    .from('amd_state')
    .select(`
      trade_date,
      amd_tag,
      judas_direction,
      daily_bias_alignment,
      layer4_d1_bias,
      reversal_confirmed,
      asian_range_pips
    `)
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });

  if (amdErr || !amdRows) throw new Error(`[Load] amd_state failed: ${amdErr?.message}`);

  const { data: m5Rows, error: m5Err } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success');

  if (m5Err || !m5Rows) throw new Error(`[Load] M5 candles failed: ${m5Err?.message}`);

  const candleMap = new Map<string, M5Candle[]>();
  for (const row of m5Rows as Array<{ trade_date: string; candles: M5Candle[] }>) {
    candleMap.set(row.trade_date, row.candles);
  }

  const days: DayData[] = [];
  const skipped = { no_m5: 0, no_prediction: 0, unknown_tag: 0 };

  for (const row of amdRows as AmdStateRow[]) {
    if (START_DATE && END_DATE && (row.trade_date < START_DATE || row.trade_date > END_DATE)) {
      continue;
    }
    if (!TAGS_TO_ANALYZE.includes(row.amd_tag as AmdTag)) {
      skipped.unknown_tag++;
      continue;
    }
    const candles = candleMap.get(row.trade_date);
    if (!candles || candles.length === 0) {
      skipped.no_m5++;
      continue;
    }
    const predicted = computePredictedDirection(row);
    if (predicted === 'NO_PREDICTION') {
      skipped.no_prediction++;
      continue;
    }
    days.push({ ...row, amd_tag: row.amd_tag as AmdTag, predicted_direction: predicted, candles });
  }

  console.log(`[Load] Days loaded: ${days.length}`);
  console.log(`[Load] Skipped - no M5: ${skipped.no_m5}`);
  console.log(`[Load] Skipped - no prediction: ${skipped.no_prediction}`);
  console.log(`[Load] Skipped - unknown tag: ${skipped.unknown_tag}`);
  console.log('');
  return days;
}

function pipsFromRef(
  candle: M5Candle,
  referencePrice: number,
  direction: 'UP' | 'DOWN',
): { favorable: number; adverse: number; lowFromRef: number; close: number } {
  const high = parseFloat(candle.h);
  const low = parseFloat(candle.l);
  const close = parseFloat(candle.c);
  if (direction === 'UP') {
    return {
      favorable: (high - referencePrice) * PIP_MULTIPLIER,
      adverse: (referencePrice - low) * PIP_MULTIPLIER,
      lowFromRef: (low - referencePrice) * PIP_MULTIPLIER,
      close: (close - referencePrice) * PIP_MULTIPLIER,
    };
  }
  return {
    favorable: (referencePrice - low) * PIP_MULTIPLIER,
    adverse: (high - referencePrice) * PIP_MULTIPLIER,
    lowFromRef: (referencePrice - high) * PIP_MULTIPLIER,
    close: (referencePrice - close) * PIP_MULTIPLIER,
  };
}

function analyzeDay(day: DayData): DayResult | null {
  const entryHour = ENTRY_HOURS[day.amd_tag];
  const exitHour = EXIT_HOURS[day.amd_tag];
  const gateCandles = day.candles.filter((candle) => {
    const hour = new Date(candle.time).getUTCHours();
    return hour >= entryHour && hour <= exitHour;
  });
  const entryCandle = gateCandles.find(
    (candle) => new Date(candle.time).getUTCHours() === entryHour,
  );
  if (!entryCandle || gateCandles.length === 0) return null;

  const referencePrice = parseFloat(entryCandle.o);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) return null;

  let mfePips = 0;
  let mfeBarIndex = 0;
  let mfeHour = entryHour;
  let currentPeakBarIndex = 0;
  let maePips = 0;
  let maeBarIndex = 0;
  let maeHour = entryHour;
  let maxGivebackFromPeakPips = 0;
  let closePips = 0;
  const hits = new Map<number, ReversalHit>();

  for (const threshold of REVERSAL_THRESHOLDS) {
    hits.set(threshold, {
      threshold,
      hit: false,
      bar_index: null,
      utc_hour: null,
      peak_before_reversal_pips: null,
    });
  }

  gateCandles.forEach((candle, barIndex) => {
    const hour = new Date(candle.time).getUTCHours();
    const measured = pipsFromRef(candle, referencePrice, day.predicted_direction);

    if (measured.favorable > mfePips) {
      mfePips = measured.favorable;
      mfeBarIndex = barIndex;
      mfeHour = hour;
      currentPeakBarIndex = barIndex;
    }
    if (measured.adverse > maePips) {
      maePips = measured.adverse;
      maeBarIndex = barIndex;
      maeHour = hour;
    }

    const giveback = Math.max(0, mfePips - measured.lowFromRef);
    if (giveback > maxGivebackFromPeakPips) maxGivebackFromPeakPips = giveback;

    for (const threshold of REVERSAL_THRESHOLDS) {
      const hit = hits.get(threshold);
      const reversalAllowed = !USE_CONSERVATIVE_REVERSAL || barIndex > currentPeakBarIndex;
      if (
        hit &&
        !hit.hit &&
        mfePips > 0 &&
        reversalAllowed &&
        measured.lowFromRef <= mfePips - threshold
      ) {
        hits.set(threshold, {
          threshold,
          hit: true,
          bar_index: barIndex,
          utc_hour: hour,
          peak_before_reversal_pips: parseFloat(mfePips.toFixed(2)),
        });
      }
    }
    closePips = measured.close;
  });

  return {
    trade_date: day.trade_date,
    amd_tag: day.amd_tag,
    predicted_direction: day.predicted_direction,
    daily_bias_alignment: day.daily_bias_alignment ?? 'NULL',
    judas_direction: day.judas_direction ?? 'NULL',
    reversal_confirmed: String(day.reversal_confirmed ?? 'NULL'),
    asian_range_bucket: asianRangeBucket(day.asian_range_pips),
    asian_range_pips: day.asian_range_pips,
    entry_hour: entryHour,
    exit_hour: exitHour,
    reference_price: referencePrice,
    bars_in_gate: gateCandles.length,
    mfe_pips: parseFloat(mfePips.toFixed(2)),
    mfe_bar_index: mfeBarIndex,
    mfe_hour: mfeHour,
    mae_pips: parseFloat(maePips.toFixed(2)),
    mae_bar_index: maeBarIndex,
    mae_hour: maeHour,
    close_pips: parseFloat(closePips.toFixed(2)),
    giveback_to_close_pips: parseFloat(Math.max(0, mfePips - closePips).toFixed(2)),
    max_giveback_from_peak_pips: parseFloat(maxGivebackFromPeakPips.toFixed(2)),
    reversals: [...hits.values()],
  };
}

async function main(): Promise<void> {
  console.log('[TimeGateReversal] Loading data...');
  const days = await loadDayData();
  printRuntimeParameters({
    scriptVersion: SCRIPT_VERSION,
    startDate: START_DATE,
    endDate: END_DATE,
    entryHours: ENTRY_HOURS,
    exitHours: EXIT_HOURS,
    reversalThresholds: REVERSAL_THRESHOLDS,
    pipMultiplier: PIP_MULTIPLIER,
    useConservativeReversal: USE_CONSERVATIVE_REVERSAL,
  });
  const results = days
    .map(analyzeDay)
    .filter((row): row is DayResult => row !== null);
  const summaries = buildSummaries(results, TAGS_TO_ANALYZE, REVERSAL_THRESHOLDS);
  printSummary(summaries);
  writeCsvs(results, summaries, REVERSAL_THRESHOLDS, Boolean(START_DATE && END_DATE));
  console.log('\n[TimeGateReversal] Done.');
}

main().catch((err) => {
  console.error('[TimeGateReversal] Fatal:', err);
  process.exit(1);
});
