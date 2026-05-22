/**
 * AMD M5 exit strategy simulation — bar-by-bar trail/time-gate/floor from Supabase M5 candles.
 * Run: npx tsx scripts/amdM5ExitStrategySimulation.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const PAIR = 'AUD_USD';

const ENTRY_HOURS: Record<string, number> = {
  AMD_TEXTBOOK: 12,
  AMD_COMPRESSION_BREAKOUT: 10,
  AMD_FAILED: 11,
  AMD_SHIFTED: 12,
  AMD_NONE: 10,
};

const HARD_EXIT_HOURS: Record<string, number> = {
  AMD_TEXTBOOK: 13,
  AMD_COMPRESSION_BREAKOUT: 13,
  AMD_FAILED: 12,
  AMD_SHIFTED: 13,
  AMD_NONE: 11,
};

const PEAK_HOURS: Record<string, number> = {
  AMD_TEXTBOOK: 13,
  AMD_COMPRESSION_BREAKOUT: 13,
  AMD_FAILED: 12,
  AMD_SHIFTED: 13,
  AMD_NONE: 11,
};

const AVG_PEAK_PIPS: Record<string, number> = {
  AMD_TEXTBOOK: 25.4,
  AMD_COMPRESSION_BREAKOUT: 21.4,
  AMD_FAILED: 14.2,
  AMD_SHIFTED: 17.6,
  AMD_NONE: 24.2,
};

const HARD_SL_PIPS = 15;
const PIP_FLOOR_TRIGGER_PCT = 0.70;
const PIP_FLOOR_GUARANTEE_PCT = 0.30;
const AVG_R_SIZE_PIPS = 5;

const TAGS_TO_ANALYZE = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
] as const;

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

type M5Row = {
  trade_date: string;
  candles: M5Candle[];
  fetch_status: string;
  candle_count: number;
};

type DayData = {
  trade_date: string;
  amd_tag: AmdTag;
  judas_direction: string | null;
  daily_bias_alignment: string | null;
  candles: M5Candle[];
  predicted_direction: string;
};

type SimResult = {
  trade_date: string;
  amd_tag: string;
  strategy: string;
  predicted_direction: string;
  entry_hour: number;
  entry_price: number;
  exit_hour: number;
  exit_price: number;
  exit_pips: number;
  exit_reason: string;
  peak_pips: number;
  is_positive: boolean;
  hard_sl_fired: boolean;
};

type StrategyConfig = {
  name: string;
  description: string;
  trail_phase_a_pips: number;
  trail_phase_b_pips: number;
  trail_phase_c_pips: number;
  use_time_gate: boolean;
  use_dynamic_trail: boolean;
  use_pip_floor: boolean;
};

type TagSummary = {
  tag: string;
  n: number;
  avg_exit_pips: number;
  avg_peak_pips: number;
  pct_positive: number;
  pct_hard_sl: number;
  avg_exit_hour: number;
  exits_by_reason: Record<string, number>;
  capture_pct: number;
  improvement_vs_baseline_pct: number;
};

const BASELINE_TRAIL_PIPS = 2.5;

const STRATEGIES: StrategyConfig[] = [
  {
    name: 'S0_BASELINE',
    description: 'Production: 2.5pip trail (0.5R × 5pip), no time gate, no floor',
    trail_phase_a_pips: BASELINE_TRAIL_PIPS,
    trail_phase_b_pips: BASELINE_TRAIL_PIPS,
    trail_phase_c_pips: BASELINE_TRAIL_PIPS,
    use_time_gate: false,
    use_dynamic_trail: false,
    use_pip_floor: false,
  },
  {
    name: 'S1_LAYER1_ONLY',
    description: 'Layer 1: 2.5pip trail + hard time exit per tag',
    trail_phase_a_pips: BASELINE_TRAIL_PIPS,
    trail_phase_b_pips: BASELINE_TRAIL_PIPS,
    trail_phase_c_pips: BASELINE_TRAIL_PIPS,
    use_time_gate: true,
    use_dynamic_trail: false,
    use_pip_floor: false,
  },
  {
    name: 'S2_LAYER1_2',
    description: 'Layer 1+2: Dynamic trail (15/7.5/3.75) + time gate',
    trail_phase_a_pips: 15,
    trail_phase_b_pips: 7.5,
    trail_phase_c_pips: 3.75,
    use_time_gate: true,
    use_dynamic_trail: true,
    use_pip_floor: false,
  },
  {
    name: 'S3_FULL',
    description: 'All layers: dynamic trail + time gate + pip floor',
    trail_phase_a_pips: 15,
    trail_phase_b_pips: 7.5,
    trail_phase_c_pips: 3.75,
    use_time_gate: true,
    use_dynamic_trail: true,
    use_pip_floor: true,
  },
];

const PHASE_B_GRID = [5, 7.5, 10, 12.5];
const PHASE_C_GRID = [2.5, 3.75, 5, 7.5];

const GRID_CONFIGS: StrategyConfig[] = [];
for (const phaseB of PHASE_B_GRID) {
  for (const phaseC of PHASE_C_GRID) {
    GRID_CONFIGS.push({
      name: `GRID_B${phaseB}_C${phaseC}`,
      description: `Grid: PhaseA=15, PhaseB=${phaseB}, PhaseC=${phaseC} + time gate + floor`,
      trail_phase_a_pips: 15,
      trail_phase_b_pips: phaseB,
      trail_phase_c_pips: phaseC,
      use_time_gate: true,
      use_dynamic_trail: true,
      use_pip_floor: true,
    });
  }
}

const ALL_STRATEGIES = [...STRATEGIES, ...GRID_CONFIGS];

function buildSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[M5Sim] Missing SUPABASE_URL or service key');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function computePredictedDirection(row: AmdStateRow): string {
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
      return 'NO_PREDICTION';
    }
    return 'NO_PREDICTION';
  }

  return 'NO_PREDICTION';
}

async function loadDayData(): Promise<DayData[]> {
  const supabase = buildSupabaseClient();

  console.log('[Load] Loading amd_state...');
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

  if (amdErr || !amdRows) {
    throw new Error(`[Load] amd_state failed: ${amdErr?.message}`);
  }

  console.log('[Load] Loading amd_m5_distribution_candles...');
  const { data: m5Rows, error: m5Err } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, fetch_status, candle_count')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success');

  if (m5Err || !m5Rows) {
    throw new Error(`[Load] m5 candles failed: ${m5Err?.message}`);
  }

  const m5Map = new Map<string, M5Candle[]>();
  for (const row of m5Rows as M5Row[]) {
    m5Map.set(row.trade_date, row.candles);
  }

  const days: DayData[] = [];
  let skippedNoM5 = 0;
  let skippedNoPrediction = 0;
  let skippedUnknownTag = 0;

  for (const amdRow of amdRows as AmdStateRow[]) {
    const tag = amdRow.amd_tag;
    if (!TAGS_TO_ANALYZE.includes(tag as AmdTag)) {
      skippedUnknownTag++;
      continue;
    }

    const candles = m5Map.get(amdRow.trade_date);
    if (!candles || candles.length === 0) {
      skippedNoM5++;
      continue;
    }

    const predicted = computePredictedDirection(amdRow);
    if (predicted === 'NO_PREDICTION') {
      skippedNoPrediction++;
      continue;
    }

    days.push({
      trade_date: amdRow.trade_date,
      amd_tag: tag as AmdTag,
      judas_direction: amdRow.judas_direction,
      daily_bias_alignment: amdRow.daily_bias_alignment,
      candles,
      predicted_direction: predicted,
    });
  }

  console.log(`[Load] Days loaded: ${days.length}`);
  console.log(`[Load] Skipped — no M5 data: ${skippedNoM5}`);
  console.log(`[Load] Skipped — no prediction: ${skippedNoPrediction}`);
  console.log(`[Load] Skipped — unknown tag: ${skippedUnknownTag}`);
  console.log('');

  return days;
}

function getFirstCandleAtHour(candles: M5Candle[], utcHour: number): M5Candle | null {
  return candles.find((candle) => new Date(candle.time).getUTCHours() >= utcHour) ?? null;
}

function computeFavorable(candle: M5Candle, entryPrice: number, direction: string): number {
  const high = parseFloat(candle.h);
  const low = parseFloat(candle.l);
  if (direction === 'UP') return (high - entryPrice) * 10000;
  return (entryPrice - low) * 10000;
}

function computeAdverse(candle: M5Candle, entryPrice: number, direction: string): number {
  const high = parseFloat(candle.h);
  const low = parseFloat(candle.l);
  if (direction === 'UP') return (entryPrice - low) * 10000;
  return (high - entryPrice) * 10000;
}

function computeClosePips(candle: M5Candle, entryPrice: number, direction: string): number {
  const close = parseFloat(candle.c);
  if (direction === 'UP') return (close - entryPrice) * 10000;
  return (entryPrice - close) * 10000;
}

function trailLevelToExitPrice(
  entryPrice: number,
  trailLevelPips: number,
  direction: string,
): number {
  if (direction === 'UP') return entryPrice + trailLevelPips / 10000;
  return entryPrice - trailLevelPips / 10000;
}

function buildSimResult(
  day: DayData,
  config: StrategyConfig,
  entryHour: number,
  entryPrice: number,
  exitHour: number,
  exitPips: number,
  exitReason: string,
  peakPips: number,
  hardSlFired: boolean,
): SimResult {
  return {
    trade_date: day.trade_date,
    amd_tag: day.amd_tag,
    strategy: config.name,
    predicted_direction: day.predicted_direction,
    entry_hour: entryHour,
    entry_price: entryPrice,
    exit_hour: exitHour,
    exit_price: trailLevelToExitPrice(entryPrice, exitPips, day.predicted_direction),
    exit_pips: exitPips,
    exit_reason: exitReason,
    peak_pips: peakPips,
    is_positive: exitPips > 0,
    hard_sl_fired: hardSlFired,
  };
}

function trailPipsForBar(
  config: StrategyConfig,
  candleHour: number,
  peakHour: number,
): number {
  if (!config.use_dynamic_trail) return config.trail_phase_a_pips;
  if (candleHour < peakHour) return config.trail_phase_a_pips;
  if (candleHour === peakHour) return config.trail_phase_b_pips;
  return config.trail_phase_c_pips;
}

function simulateDay(day: DayData, config: StrategyConfig): SimResult | null {
  const entryHour = ENTRY_HOURS[day.amd_tag];
  const hardExitHour = HARD_EXIT_HOURS[day.amd_tag];
  const peakHour = PEAK_HOURS[day.amd_tag];
  const avgPeak = AVG_PEAK_PIPS[day.amd_tag];

  if (!entryHour || !hardExitHour || !peakHour || !avgPeak) return null;

  const entryCandleFirst = getFirstCandleAtHour(day.candles, entryHour);
  if (!entryCandleFirst) return null;

  const entryPrice = parseFloat(entryCandleFirst.o);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  let peakFavorable = 0;
  let pipFloorActivated = false;
  const pipFloorLevel = avgPeak * PIP_FLOOR_GUARANTEE_PCT;
  const pipFloorTrigger = avgPeak * PIP_FLOOR_TRIGGER_PCT;

  const simulationCandles = day.candles.filter((candle) => {
    const hourUtc = new Date(candle.time).getUTCHours();
    return hourUtc >= entryHour && hourUtc <= 15;
  });

  if (simulationCandles.length === 0) return null;

  const firstHardExitCandleTime =
    day.candles.find((candle) => new Date(candle.time).getUTCHours() === hardExitHour)?.time ??
    null;

  for (const candle of simulationCandles) {
    const candleHour = new Date(candle.time).getUTCHours();
    const favorable = computeFavorable(candle, entryPrice, day.predicted_direction);
    const adverse = computeAdverse(candle, entryPrice, day.predicted_direction);

    if (favorable > peakFavorable) peakFavorable = favorable;
    if (config.use_pip_floor && peakFavorable >= pipFloorTrigger) pipFloorActivated = true;

    const trailPips = trailPipsForBar(config, candleHour, peakHour);

    if (adverse >= HARD_SL_PIPS) {
      return buildSimResult(
        day, config, entryHour, entryPrice, candleHour, -HARD_SL_PIPS, 'hard_sl',
        peakFavorable, true,
      );
    }

    if (peakFavorable > 0 && peakFavorable >= trailPips) {
      const trailLevel = peakFavorable - trailPips;
      if (adverse >= trailLevel) {
        let exitPips = trailLevel;
        if (pipFloorActivated && exitPips < pipFloorLevel) exitPips = pipFloorLevel;
        const exitReason =
          pipFloorActivated && trailLevel < pipFloorLevel ? 'pip_floor' : 'trail_stop';
        return buildSimResult(
          day, config, entryHour, entryPrice, candleHour, exitPips, exitReason,
          peakFavorable, false,
        );
      }
    }

    if (
      config.use_time_gate &&
      candleHour === hardExitHour &&
      candle.time === firstHardExitCandleTime
    ) {
      const exitPriceRaw = parseFloat(candle.o);
      let exitPips =
        day.predicted_direction === 'UP'
          ? (exitPriceRaw - entryPrice) * 10000
          : (entryPrice - exitPriceRaw) * 10000;
      if (pipFloorActivated && exitPips < pipFloorLevel) exitPips = pipFloorLevel;
      const exitReason =
        pipFloorActivated && exitPips === pipFloorLevel ? 'pip_floor' : 'time_gate';
      return buildSimResult(
        day, config, entryHour, entryPrice, candleHour, exitPips, exitReason,
        peakFavorable, false,
      );
    }
  }

  const lastCandle = simulationCandles[simulationCandles.length - 1];
  const lastHour = new Date(lastCandle.time).getUTCHours();
  let exitPips = computeClosePips(lastCandle, entryPrice, day.predicted_direction);
  if (pipFloorActivated && exitPips < pipFloorLevel) exitPips = pipFloorLevel;

  return buildSimResult(
    day, config, entryHour, entryPrice, lastHour, exitPips, 'max_hold',
    peakFavorable, false,
  );
}

function aggregateByTag(
  results: SimResult[],
  baselineAvgByTag: Record<string, number>,
): Record<string, TagSummary> {
  const summaries: Record<string, TagSummary> = {};

  for (const tag of TAGS_TO_ANALYZE) {
    const tagResults = results.filter((result) => result.amd_tag === tag);
    if (tagResults.length === 0) continue;

    const n = tagResults.length;
    const avgExitPips = tagResults.reduce((sum, result) => sum + result.exit_pips, 0) / n;
    const avgPeakPips = tagResults.reduce((sum, result) => sum + result.peak_pips, 0) / n;
    const pctPositive = (tagResults.filter((result) => result.is_positive).length / n) * 100;
    const pctHardSl = (tagResults.filter((result) => result.hard_sl_fired).length / n) * 100;
    const avgExitHour = tagResults.reduce((sum, result) => sum + result.exit_hour, 0) / n;
    const capturePct = avgPeakPips > 0 ? (avgExitPips / avgPeakPips) * 100 : 0;

    const exitsByReason: Record<string, number> = {};
    for (const result of tagResults) {
      exitsByReason[result.exit_reason] = (exitsByReason[result.exit_reason] ?? 0) + 1;
    }

    const baselineAvg = baselineAvgByTag[tag] ?? 0;
    const improvement =
      baselineAvg !== 0 ? ((avgExitPips - baselineAvg) / Math.abs(baselineAvg)) * 100 : 0;

    summaries[tag] = {
      tag,
      n,
      avg_exit_pips: parseFloat(avgExitPips.toFixed(2)),
      avg_peak_pips: parseFloat(avgPeakPips.toFixed(2)),
      pct_positive: parseFloat(pctPositive.toFixed(1)),
      pct_hard_sl: parseFloat(pctHardSl.toFixed(1)),
      avg_exit_hour: parseFloat(avgExitHour.toFixed(1)),
      exits_by_reason: exitsByReason,
      capture_pct: parseFloat(capturePct.toFixed(1)),
      improvement_vs_baseline_pct: parseFloat(improvement.toFixed(1)),
    };
  }

  return summaries;
}

function reasonPct(exitsByReason: Record<string, number>, reason: string, n: number): string {
  const count = exitsByReason[reason] ?? 0;
  return n === 0 ? '0%' : `${Math.round((100 * count) / n)}%`;
}

function overallFromSummaries(summaries: Record<string, TagSummary>): {
  avg_exit_pips: number;
  pct_positive: number;
  capture_pct: number;
  pct_hard_sl: number;
} {
  const tags = Object.values(summaries);
  if (tags.length === 0) {
    return { avg_exit_pips: 0, pct_positive: 0, capture_pct: 0, pct_hard_sl: 0 };
  }
  const totalN = tags.reduce((sum, tagSummary) => sum + tagSummary.n, 0);
  const weighted = (field: keyof TagSummary) =>
    tags.reduce((sum, tagSummary) => sum + Number(tagSummary[field]) * tagSummary.n, 0) / totalN;
  return {
    avg_exit_pips: parseFloat(weighted('avg_exit_pips').toFixed(2)),
    pct_positive: parseFloat(weighted('pct_positive').toFixed(1)),
    capture_pct: parseFloat(weighted('capture_pct').toFixed(1)),
    pct_hard_sl: parseFloat(weighted('pct_hard_sl').toFixed(1)),
  };
}

function strategyLabel(name: string): string {
  if (name === 'S0_BASELINE') return 'S0 Baseline';
  if (name === 'S1_LAYER1_ONLY') return 'S1 Layer1';
  if (name === 'S2_LAYER1_2') return 'S2 Layer1+2';
  if (name === 'S3_FULL') return 'S3 Full';
  return name;
}

function printTagBlock(
  tag: string,
  summariesByStrategy: Map<string, Record<string, TagSummary>>,
): void {
  const baseline = summariesByStrategy.get('S0_BASELINE')?.[tag];
  if (!baseline) return;

  console.log(`\n${tag} (n=${baseline.n}):`);
  for (const config of STRATEGIES) {
    const tagSummary = summariesByStrategy.get(config.name)?.[tag];
    if (!tagSummary) continue;

    const exits = tagSummary.exits_by_reason;
    let line =
      `  ${strategyLabel(config.name).padEnd(11)} | Exit: ${tagSummary.avg_exit_pips.toFixed(1)}p` +
      ` | Peak: ${tagSummary.avg_peak_pips.toFixed(1)}p` +
      ` | Capture: ${tagSummary.capture_pct.toFixed(0)}%` +
      ` | Pos%: ${tagSummary.pct_positive.toFixed(0)}%` +
      ` | SL%: ${tagSummary.pct_hard_sl.toFixed(0)}%` +
      ` | AvgHr: ${tagSummary.avg_exit_hour.toFixed(1)}`;

    if (config.name === 'S0_BASELINE') {
      line +=
        ` | Exits: trail=${reasonPct(exits, 'trail_stop', tagSummary.n)}` +
        ` time=${reasonPct(exits, 'time_gate', tagSummary.n)}` +
        ` sl=${reasonPct(exits, 'hard_sl', tagSummary.n)}` +
        ` floor=${reasonPct(exits, 'pip_floor', tagSummary.n)}` +
        ` hold=${reasonPct(exits, 'max_hold', tagSummary.n)}`;
    } else {
      line += ` | vs S0: ${tagSummary.improvement_vs_baseline_pct >= 0 ? '+' : ''}${tagSummary.improvement_vs_baseline_pct.toFixed(0)}%`;
    }
    console.log(line);
  }
}

function printSummary(
  allResults: SimResult[],
  daysAnalyzed: number,
  baselineAvgByTag: Record<string, number>,
): void {
  const summariesByStrategy = new Map<string, Record<string, TagSummary>>();
  for (const config of ALL_STRATEGIES) {
    const strategyResults = allResults.filter((result) => result.strategy === config.name);
    summariesByStrategy.set(
      config.name,
      aggregateByTag(strategyResults, baselineAvgByTag),
    );
  }

  const s0Overall = overallFromSummaries(summariesByStrategy.get('S0_BASELINE') ?? {});

  console.log('=== AMD M5 EXIT STRATEGY SIMULATION ===');
  console.log(`Days analyzed: ${daysAnalyzed}`);
  console.log('Resolution: M5 (actual intrabar H/L, 30s production accuracy)');
  console.log('Entry: Option A — first M5 bar open at entry hour UTC');
  console.log('Hard SL: 15 pips (3x SL multiplier × 5pip avg R)');
  console.log('Baseline trail: 2.5 pips (production: 0.5R × 5pip avg R)');
  console.log('\n--- Strategy Comparison by AMD Tag ---');

  for (const tag of TAGS_TO_ANALYZE) printTagBlock(tag, summariesByStrategy);

  console.log('\n--- Overall (all tags combined, weighted by n) ---');
  console.log(
    `  S0 Baseline | Avg exit: ${s0Overall.avg_exit_pips.toFixed(1)}p | Pos%: ${s0Overall.pct_positive.toFixed(0)}%`,
  );
  for (const config of STRATEGIES.slice(1)) {
    const overall = overallFromSummaries(summariesByStrategy.get(config.name) ?? {});
    const vsBaseline =
      s0Overall.avg_exit_pips !== 0
        ? ((overall.avg_exit_pips - s0Overall.avg_exit_pips) / Math.abs(s0Overall.avg_exit_pips)) * 100
        : 0;
    console.log(
      `  ${strategyLabel(config.name).padEnd(11)} | Avg exit: ${overall.avg_exit_pips.toFixed(1)}p` +
        ` | Pos%: ${overall.pct_positive.toFixed(0)}%` +
        ` | vs S0: ${vsBaseline >= 0 ? '+' : ''}${vsBaseline.toFixed(0)}%`,
    );
  }

  console.log('\n--- Grid Search: Best Phase B + Phase C (S3 all layers) ---');
  console.log('(ranked by overall avg exit pips)');
  console.log('Rank | Config           | Avg exit | Pos% | vs S0 | Capture%');

  const gridRanked = GRID_CONFIGS.map((config) => {
    const overall = overallFromSummaries(summariesByStrategy.get(config.name) ?? {});
    const vsBaseline =
      s0Overall.avg_exit_pips !== 0
        ? ((overall.avg_exit_pips - s0Overall.avg_exit_pips) / Math.abs(s0Overall.avg_exit_pips)) * 100
        : 0;
    return { config, overall, vsBaseline };
  })
    .sort((a, b) => b.overall.avg_exit_pips - a.overall.avg_exit_pips)
    .slice(0, 10);

  gridRanked.forEach((entry, index) => {
    console.log(
      `${String(index + 1).padEnd(4)} | ${entry.config.name.padEnd(16)} | ${entry.overall.avg_exit_pips.toFixed(1)}p`.padEnd(38) +
        ` | ${entry.overall.pct_positive.toFixed(0)}%`.padEnd(6) +
        ` | ${entry.vsBaseline >= 0 ? '+' : ''}${entry.vsBaseline.toFixed(0)}%`.padEnd(6) +
        ` | ${entry.overall.capture_pct.toFixed(0)}%`,
    );
  });

  console.log('\n--- Best Grid Config Per Tag ---');
  for (const tag of TAGS_TO_ANALYZE) {
    let bestName = 'n/a';
    let bestSummary: TagSummary | null = null;
    for (const config of GRID_CONFIGS) {
      const tagSummary = summariesByStrategy.get(config.name)?.[tag];
      if (!tagSummary) continue;
      if (!bestSummary || tagSummary.avg_exit_pips > bestSummary.avg_exit_pips) {
        bestName = config.name;
        bestSummary = tagSummary;
      }
    }
    if (bestSummary) {
      console.log(
        `${tag.padEnd(26)} Best = ${bestName} | Exit: ${bestSummary.avg_exit_pips.toFixed(1)}p` +
          ` | Pos%: ${bestSummary.pct_positive.toFixed(0)}%` +
          ` | Capture: ${bestSummary.capture_pct.toFixed(0)}%`,
      );
    }
  }

  console.log('\n--- Hard SL Analysis ---');
  console.log(
    `Overall hard SL rate across all tags (S0 Baseline): ${s0Overall.pct_hard_sl.toFixed(0)}%`,
  );
  console.log('(High SL rate = trail too wide, price reverses before trail activates)');

  const s3Overall = overallFromSummaries(summariesByStrategy.get('S3_FULL') ?? {});
  const s0R = s0Overall.avg_exit_pips / AVG_R_SIZE_PIPS;
  const s3R = s3Overall.avg_exit_pips / AVG_R_SIZE_PIPS;
  const deltaPips = s3Overall.avg_exit_pips - s0Overall.avg_exit_pips;
  const deltaR = deltaPips / AVG_R_SIZE_PIPS;

  console.log('\n--- R-Unit Translation (avg R = 5 pips) ---');
  console.log(`S0 Baseline: ${s0Overall.avg_exit_pips.toFixed(1)}p = ${s0R >= 0 ? '+' : ''}${s0R.toFixed(2)}R avg`);
  console.log(`S3 Full:     ${s3Overall.avg_exit_pips.toFixed(1)}p = ${s3R >= 0 ? '+' : ''}${s3R.toFixed(2)}R avg`);
  console.log(
    `Improvement: ${deltaPips >= 0 ? '+' : ''}${deltaPips.toFixed(1)}p = ${deltaR >= 0 ? '+' : ''}${deltaR.toFixed(2)}R per AMD-window trade`,
  );
}

function writeCsv(allResults: SimResult[]): void {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'amd_m5_exit_strategy_simulation.csv');
  const header =
    'trade_date,amd_tag,strategy,entry_hour,entry_price,exit_hour,exit_pips,exit_reason,peak_pips,is_positive,hard_sl_fired,predicted_direction';
  const lines = [header];
  for (const result of allResults) {
    lines.push(
      [
        result.trade_date,
        result.amd_tag,
        result.strategy,
        result.entry_hour,
        result.entry_price,
        result.exit_hour,
        result.exit_pips,
        result.exit_reason,
        result.peak_pips,
        result.is_positive,
        result.hard_sl_fired,
        result.predicted_direction,
      ].join(','),
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
  console.log(`\n[M5Sim] CSV written: ${csvPath}`);
}

async function main(): Promise<void> {
  console.log('[M5Sim] Loading data...');
  const days = await loadDayData();

  if (days.length === 0) {
    throw new Error('[M5Sim] No days loaded. Check amd_state and amd_m5_distribution_candles.');
  }

  const baselineAvgByTag: Record<string, number> = {};
  for (const tag of TAGS_TO_ANALYZE) {
    const tagDays = days.filter((day) => day.amd_tag === tag);
    const baselineResults = tagDays
      .map((day) => simulateDay(day, STRATEGIES[0]))
      .filter((result): result is SimResult => result !== null);
    baselineAvgByTag[tag] =
      baselineResults.length > 0
        ? baselineResults.reduce((sum, result) => sum + result.exit_pips, 0) / baselineResults.length
        : 0;
  }

  const allResults: SimResult[] = [];
  for (const config of ALL_STRATEGIES) {
    for (const day of days) {
      const result = simulateDay(day, config);
      if (result) allResults.push(result);
    }
  }

  printSummary(allResults, days.length, baselineAvgByTag);
  writeCsv(allResults);
  console.log('\n[M5Sim] Done.');
}

main().catch((err) => {
  console.error('[M5Sim] Fatal:', err);
  process.exit(1);
});
