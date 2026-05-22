/**
 * AMD exit strategy simulation — pure CSV analysis from peak degradation backtest output.
 * Run: npx ts-node scripts/amdExitStrategySimulation.ts
 */

import * as fs from 'fs';
import * as path from 'path';

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

const PHASE_B_HOURS: Record<string, number> = {
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

const PIP_FLOOR_PCT = 0.30;
const AVG_R_SIZE_PIPS = 5;

const DISTRIBUTION_HOURS = [10, 11, 12, 13, 14, 15] as const;
const TAGS_TO_ANALYZE = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
] as const;

type DayRow = {
  trade_date: string;
  amd_tag: string;
  predicted_direction: string;
  peak_hour: number;
  degradation_starts_hour: number;
  hours: Map<number, { favorable: number; close: number; peak_so_far: number }>;
};

type SimResult = {
  exit_pips: number;
  exit_hour: number;
  exit_reason: string;
  is_positive: boolean;
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
  pct_positive: number;
  avg_exit_hour: number;
  exits_by_reason: Record<string, number>;
  pct_improvement_vs_baseline: number;
};

const STRATEGIES: StrategyConfig[] = [
  {
    name: 'S0_BASELINE',
    description: 'Current: Trail=15pips always, no time gate, no floor',
    trail_phase_a_pips: 15,
    trail_phase_b_pips: 15,
    trail_phase_c_pips: 15,
    use_time_gate: false,
    use_dynamic_trail: false,
    use_pip_floor: false,
  },
  {
    name: 'S1_LAYER1_ONLY',
    description: 'Layer 1: Trail=15pips + hard time exit per tag',
    trail_phase_a_pips: 15,
    trail_phase_b_pips: 15,
    trail_phase_c_pips: 15,
    use_time_gate: true,
    use_dynamic_trail: false,
    use_pip_floor: false,
  },
  {
    name: 'S2_LAYER1_2',
    description: 'Layer 1+2: Dynamic trail (15/7.5/3.75) + time exit',
    trail_phase_a_pips: 15,
    trail_phase_b_pips: 7.5,
    trail_phase_c_pips: 3.75,
    use_time_gate: true,
    use_dynamic_trail: true,
    use_pip_floor: false,
  },
  {
    name: 'S3_FULL',
    description: 'Layer 1+2+3: Dynamic trail + time exit + pip floor',
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
      description: `Grid: PhaseA=15, PhaseB=${phaseB}, PhaseC=${phaseC} + time exit + floor`,
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

function parseCSV(csvPath: string): DayRow[] {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  const col = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? '') : '';
  };

  const rows: DayRow[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const parts = lines[lineIndex].split(',');
    const tag = col(parts, 'amd_tag');
    const predicted = col(parts, 'predicted_direction');

    if (!TAGS_TO_ANALYZE.includes(tag as (typeof TAGS_TO_ANALYZE)[number])) continue;
    if (predicted !== 'UP' && predicted !== 'DOWN') continue;

    const hours = new Map<number, { favorable: number; close: number; peak_so_far: number }>();

    for (const hourUtc of DISTRIBUTION_HOURS) {
      const favorable = parseFloat(col(parts, `h${hourUtc}_favorable`));
      const close = parseFloat(col(parts, `h${hourUtc}_close`));
      const peak = parseFloat(col(parts, `h${hourUtc}_peak`));
      if (Number.isFinite(favorable) && Number.isFinite(close) && Number.isFinite(peak)) {
        hours.set(hourUtc, { favorable, close, peak_so_far: peak });
      }
    }

    const peakHour = parseInt(col(parts, 'peak_hour'), 10);
    const degradationStartsHour = parseInt(col(parts, 'degradation_starts_hour'), 10);

    rows.push({
      trade_date: col(parts, 'trade_date'),
      amd_tag: tag,
      predicted_direction: predicted,
      peak_hour: Number.isFinite(peakHour) ? peakHour : -1,
      degradation_starts_hour: Number.isFinite(degradationStartsHour)
        ? degradationStartsHour
        : -1,
      hours,
    });
  }

  return rows;
}

function peakFavorableAvailable(row: DayRow): number {
  let peak = 0;
  for (const hourUtc of DISTRIBUTION_HOURS) {
    const hourData = row.hours.get(hourUtc);
    if (hourData) peak = Math.max(peak, hourData.favorable);
  }
  return peak;
}

function trailPipsForHour(
  config: StrategyConfig,
  hourUtc: number,
  phaseBHour: number,
): number {
  if (!config.use_dynamic_trail) return config.trail_phase_a_pips;
  if (hourUtc < phaseBHour) return config.trail_phase_a_pips;
  if (hourUtc === phaseBHour) return config.trail_phase_b_pips;
  return config.trail_phase_c_pips;
}

function simulateDay(row: DayRow, config: StrategyConfig): SimResult | null {
  const entryHour = ENTRY_HOURS[row.amd_tag];
  const hardExitHour = HARD_EXIT_HOURS[row.amd_tag];
  const phaseBHour = PHASE_B_HOURS[row.amd_tag];
  const avgPeak = AVG_PEAK_PIPS[row.amd_tag];
  const pipFloor = avgPeak * PIP_FLOOR_PCT;
  const pip70Threshold = avgPeak * 0.70;

  if (!entryHour || !hardExitHour || !phaseBHour || !avgPeak) return null;

  let runningPeak = 0;
  let pipFloorActivated = false;

  const simulationHours = DISTRIBUTION_HOURS.filter((hourUtc) => hourUtc >= entryHour);

  for (const hourUtc of simulationHours) {
    const hourData = row.hours.get(hourUtc);
    if (!hourData) continue;

    const { favorable, close } = hourData;
    runningPeak = Math.max(runningPeak, favorable);

    const trailPips = trailPipsForHour(config, hourUtc, phaseBHour);

    if (config.use_pip_floor && favorable >= pip70Threshold) {
      pipFloorActivated = true;
    }

    if (runningPeak > 0 && close <= runningPeak - trailPips) {
      const exitPips = pipFloorActivated ? Math.max(close, pipFloor) : close;
      return {
        exit_pips: exitPips,
        exit_hour: hourUtc,
        exit_reason: pipFloorActivated && close < pipFloor ? 'pip_floor' : 'trail',
        is_positive: exitPips > 0,
      };
    }

    if (config.use_time_gate && hourUtc === hardExitHour) {
      const exitPips = pipFloorActivated ? Math.max(close, pipFloor) : close;
      return {
        exit_pips: exitPips,
        exit_hour: hourUtc,
        exit_reason: 'time_gate',
        is_positive: exitPips > 0,
      };
    }
  }

  const lastHour = simulationHours[simulationHours.length - 1];
  const lastData = row.hours.get(lastHour);
  const exitPips = lastData
    ? pipFloorActivated
      ? Math.max(lastData.close, pipFloor)
      : lastData.close
    : 0;

  return {
    exit_pips: exitPips,
    exit_hour: lastHour,
    exit_reason: 'max_hold',
    is_positive: exitPips > 0,
  };
}

function aggregateResults(
  rows: DayRow[],
  config: StrategyConfig,
  baselineAvgByTag: Record<string, number>,
): Record<string, TagSummary> {
  const byTag: Record<string, SimResult[]> = {};

  for (const row of rows) {
    const result = simulateDay(row, config);
    if (!result) continue;
    if (!byTag[row.amd_tag]) byTag[row.amd_tag] = [];
    byTag[row.amd_tag].push(result);
  }

  const summaries: Record<string, TagSummary> = {};

  for (const tag of TAGS_TO_ANALYZE) {
    const results = byTag[tag] ?? [];
    if (results.length === 0) continue;

    const avgExitPips = results.reduce((sum, result) => sum + result.exit_pips, 0) / results.length;
    const pctPositive =
      (results.filter((result) => result.is_positive).length / results.length) * 100;
    const avgExitHour =
      results.reduce((sum, result) => sum + result.exit_hour, 0) / results.length;
    const exitsByReason: Record<string, number> = {};
    for (const result of results) {
      exitsByReason[result.exit_reason] = (exitsByReason[result.exit_reason] ?? 0) + 1;
    }

    const baselineAvg = baselineAvgByTag[tag] ?? 0;
    const pctImprovement =
      baselineAvg !== 0
        ? ((avgExitPips - baselineAvg) / Math.abs(baselineAvg)) * 100
        : 0;

    summaries[tag] = {
      tag,
      n: results.length,
      avg_exit_pips: parseFloat(avgExitPips.toFixed(2)),
      pct_positive: parseFloat(pctPositive.toFixed(1)),
      avg_exit_hour: parseFloat(avgExitHour.toFixed(1)),
      exits_by_reason: exitsByReason,
      pct_improvement_vs_baseline: parseFloat(pctImprovement.toFixed(1)),
    };
  }

  return summaries;
}

function overallSummary(summaries: Record<string, TagSummary>): {
  avg_exit_pips: number;
  pct_positive: number;
  n: number;
} {
  const tags = Object.values(summaries);
  if (tags.length === 0) return { avg_exit_pips: 0, pct_positive: 0, n: 0 };
  const totalN = tags.reduce((sum, tagSummary) => sum + tagSummary.n, 0);
  const weightedExit =
    tags.reduce((sum, tagSummary) => sum + tagSummary.avg_exit_pips * tagSummary.n, 0) / totalN;
  const weightedPositive =
    tags.reduce((sum, tagSummary) => sum + tagSummary.pct_positive * tagSummary.n, 0) / totalN;
  return {
    avg_exit_pips: parseFloat(weightedExit.toFixed(2)),
    pct_positive: parseFloat(weightedPositive.toFixed(1)),
    n: totalN,
  };
}

function reasonPct(exitsByReason: Record<string, number>, reason: string, n: number): string {
  const count = exitsByReason[reason] ?? 0;
  return n === 0 ? '0%' : `${Math.round((100 * count) / n)}%`;
}

function strategyLabel(name: string): string {
  if (name === 'S0_BASELINE') return 'S0 Baseline';
  if (name === 'S1_LAYER1_ONLY') return 'S1 Layer1';
  if (name === 'S2_LAYER1_2') return 'S2 Layer1+2';
  if (name === 'S3_FULL') return 'S3 Full';
  return name;
}

function printTagStrategyBlock(
  tag: string,
  summariesByStrategy: Map<string, Record<string, TagSummary>>,
): void {
  const baseline = summariesByStrategy.get('S0_BASELINE')?.[tag];
  if (!baseline) return;

  console.log(`\n${tag} (n=${baseline.n}):`);

  for (const config of STRATEGIES) {
    const tagSummary = summariesByStrategy.get(config.name)?.[tag];
    if (!tagSummary) continue;

    const trailCount = tagSummary.exits_by_reason.trail ?? 0;
    const timeCount = tagSummary.exits_by_reason.time_gate ?? 0;
    const floorCount = tagSummary.exits_by_reason.pip_floor ?? 0;
    const holdCount = tagSummary.exits_by_reason.max_hold ?? 0;

    let line =
      `  ${strategyLabel(config.name).padEnd(15)} | Avg exit: ${tagSummary.avg_exit_pips.toFixed(1)}p` +
      ` | Pos%: ${tagSummary.pct_positive.toFixed(0)}%` +
      ` | Avg hr: ${tagSummary.avg_exit_hour.toFixed(1)}` +
      ` | Trail:${trailCount} Time:${timeCount} Floor:${floorCount} Hold:${holdCount}`;

    if (config.name !== 'S0_BASELINE') {
      line += ` | Improvement: ${tagSummary.pct_improvement_vs_baseline >= 0 ? '+' : ''}${tagSummary.pct_improvement_vs_baseline.toFixed(0)}%`;
    }

    console.log(line);
  }
}

function printSummary(
  allResults: Array<{ config: StrategyConfig; summaries: Record<string, TagSummary> }>,
  daysProcessed: number,
): void {
  const summariesByStrategy = new Map(
    allResults.map((entry) => [entry.config.name, entry.summaries]),
  );

  const s0Overall = overallSummary(summariesByStrategy.get('S0_BASELINE') ?? {});

  console.log('=== AMD EXIT STRATEGY SIMULATION ===');
  console.log(`Days loaded: ${daysProcessed} | Days processed: ${daysProcessed}`);
  console.log('Simulation uses close_pips at exit hour as exit approximation (H1 resolution)');
  console.log('\n--- Strategy Comparison by AMD Tag ---');

  for (const tag of TAGS_TO_ANALYZE) {
    printTagStrategyBlock(tag, summariesByStrategy);
  }

  console.log('\n--- Overall (all tags combined) ---');
  console.log(
    `  S0 Baseline  | Avg exit: ${s0Overall.avg_exit_pips.toFixed(1)}p | Pos%: ${s0Overall.pct_positive.toFixed(0)}%`,
  );

  for (const config of STRATEGIES.slice(1)) {
    const overall = overallSummary(summariesByStrategy.get(config.name) ?? {});
    const vsBaseline =
      s0Overall.avg_exit_pips !== 0
        ? ((overall.avg_exit_pips - s0Overall.avg_exit_pips) / Math.abs(s0Overall.avg_exit_pips)) *
          100
        : 0;
    console.log(
      `  ${strategyLabel(config.name).padEnd(11)} | Avg exit: ${overall.avg_exit_pips.toFixed(1)}p` +
        ` | Pos%: ${overall.pct_positive.toFixed(0)}%` +
        ` | vs baseline: ${vsBaseline >= 0 ? '+' : ''}${vsBaseline.toFixed(0)}%`,
    );
  }

  console.log('\n--- Grid Search: Best Phase B + Phase C Trail Combo (S3 + all layers) ---');
  console.log('(ranked by overall avg exit pips across all tags)');
  console.log('Rank | Config               | Avg exit pips | Pos% | vs S0 baseline');

  const gridRanked = GRID_CONFIGS.map((config) => {
    const overall = overallSummary(
      allResults.find((entry) => entry.config.name === config.name)?.summaries ?? {},
    );
    const vsBaseline =
      s0Overall.avg_exit_pips !== 0
        ? ((overall.avg_exit_pips - s0Overall.avg_exit_pips) / Math.abs(s0Overall.avg_exit_pips)) *
          100
        : 0;
    return { config, overall, vsBaseline };
  })
    .sort((a, b) => b.overall.avg_exit_pips - a.overall.avg_exit_pips)
    .slice(0, 10);

  gridRanked.forEach((entry, index) => {
    console.log(
      `${String(index + 1).padEnd(4)} | ${entry.config.name.padEnd(20)} | ${entry.overall.avg_exit_pips.toFixed(1)}p`.padEnd(42) +
        `         | ${entry.overall.pct_positive.toFixed(0)}%`.padEnd(6) +
        `  | ${entry.vsBaseline >= 0 ? '+' : ''}${entry.vsBaseline.toFixed(0)}%`,
    );
  });

  console.log('\n--- Best Grid Config Per Tag ---');
  for (const tag of TAGS_TO_ANALYZE) {
    let bestName = 'n/a';
    let bestAvg = 0;
    let bestPos = 0;

    for (const config of GRID_CONFIGS) {
      const tagSummary = summariesByStrategy.get(config.name)?.[tag];
      if (!tagSummary) continue;
      if (bestName === 'n/a' || tagSummary.avg_exit_pips > bestAvg) {
        bestName = config.name;
        bestAvg = tagSummary.avg_exit_pips;
        bestPos = tagSummary.pct_positive;
      }
    }

    console.log(
      `${tag.padEnd(26)} Best = ${bestName} | Avg exit: ${bestAvg.toFixed(1)}p | Pos%: ${bestPos.toFixed(0)}%`,
    );
  }

  console.log('\n--- Exit Reason Breakdown — S3 Full Strategy ---');
  const s3Summaries = summariesByStrategy.get('S3_FULL') ?? {};
  for (const tag of TAGS_TO_ANALYZE) {
    const tagSummary = s3Summaries[tag];
    if (!tagSummary) continue;
    console.log(
      `${tag}: trail=${reasonPct(tagSummary.exits_by_reason, 'trail', tagSummary.n)}` +
        ` | time_gate=${reasonPct(tagSummary.exits_by_reason, 'time_gate', tagSummary.n)}` +
        ` | pip_floor=${reasonPct(tagSummary.exits_by_reason, 'pip_floor', tagSummary.n)}` +
        ` | max_hold=${reasonPct(tagSummary.exits_by_reason, 'max_hold', tagSummary.n)}`,
    );
  }

  const s3Overall = overallSummary(s3Summaries);
  const s0R = s0Overall.avg_exit_pips / AVG_R_SIZE_PIPS;
  const s3R = s3Overall.avg_exit_pips / AVG_R_SIZE_PIPS;
  const deltaPips = s3Overall.avg_exit_pips - s0Overall.avg_exit_pips;
  const deltaR = deltaPips / AVG_R_SIZE_PIPS;

  console.log('\n--- R-Unit Translation (assuming avg R size = 5 pips) ---');
  console.log(`S0 Baseline overall: ${s0Overall.avg_exit_pips.toFixed(1)} pips = ${s0R >= 0 ? '+' : ''}${s0R.toFixed(2)}R avg`);
  console.log(`S3 Full overall:     ${s3Overall.avg_exit_pips.toFixed(1)} pips = ${s3R >= 0 ? '+' : ''}${s3R.toFixed(2)}R avg`);
  console.log(
    `Improvement:         ${deltaPips >= 0 ? '+' : ''}${deltaPips.toFixed(1)} pips = ${deltaR >= 0 ? '+' : ''}${deltaR.toFixed(2)}R per trade`,
  );
}

function writeCsv(rows: DayRow[], configs: StrategyConfig[]): void {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'amd_exit_strategy_simulation.csv');

  const header =
    'trade_date,amd_tag,strategy,entry_hour,exit_hour,exit_pips,exit_reason,is_positive,peak_favorable_available';
  const lines = [header];

  for (const row of rows) {
    for (const config of configs) {
      const result = simulateDay(row, config);
      if (!result) continue;
      const entryHour = ENTRY_HOURS[row.amd_tag] ?? '';
      lines.push(
        [
          row.trade_date,
          row.amd_tag,
          config.name,
          entryHour,
          result.exit_hour,
          result.exit_pips,
          result.exit_reason,
          result.is_positive,
          peakFavorableAvailable(row),
        ].join(','),
      );
    }
  }

  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
  console.log(`\n[ExitSim] CSV written: ${csvPath}`);
}

async function main(): Promise<void> {
  const csvPath = path.join(
    process.cwd(),
    'scripts',
    'output',
    'amd_peak_degradation_backtest.csv',
  );

  if (!fs.existsSync(csvPath)) {
    throw new Error(`[ExitSim] CSV not found: ${csvPath}. Run amdPeakDegradationBacktest.ts first.`);
  }

  const rows = parseCSV(csvPath);
  console.log(`[ExitSim] Loaded ${rows.length} rows`);

  const baselineAvgByTag: Record<string, number> = {};
  for (const tag of TAGS_TO_ANALYZE) {
    const tagRows = rows.filter((row) => row.amd_tag === tag);
    const results = tagRows
      .map((row) => simulateDay(row, STRATEGIES[0]))
      .filter((result): result is SimResult => result !== null);
    baselineAvgByTag[tag] =
      results.length > 0
        ? results.reduce((sum, result) => sum + result.exit_pips, 0) / results.length
        : 0;
  }

  const allResults: Array<{ config: StrategyConfig; summaries: Record<string, TagSummary> }> = [];

  for (const config of ALL_STRATEGIES) {
    const summaries = aggregateResults(rows, config, baselineAvgByTag);
    allResults.push({ config, summaries });
  }

  printSummary(allResults, rows.length);
  writeCsv(rows, ALL_STRATEGIES);

  console.log('\n[ExitSim] Done.');
}

main().catch((err) => {
  console.error('[ExitSim] Fatal:', err);
  process.exit(1);
});
