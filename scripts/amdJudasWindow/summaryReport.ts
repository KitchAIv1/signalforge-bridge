import type { JudasWindowVariant } from './judasDetect.js';

export type BacktestCsvRow = Record<string, string | number | boolean>;

type VariantSummary = {
  label: string;
  analyzed: number;
  judasFired: number;
  breachCount: number;
  insideCount: number;
  correctCount: number;
  correctExFix: number;
  exFixAnalyzed: number;
  textbook: number;
  failed: number;
  shifted: number;
  vSweepDays: number;
  vSweepCorrect: number;
};

type BreachFixGroupId = 'A' | 'B' | 'C' | 'D';

type BreachFixGroupStats = {
  n: number;
  correctHits: number;
  peakJudasSum: number;
  peakCounterSum: number;
  peakSampleCount: number;
};

type BreachFixWindowStats = {
  windowLabel: string;
  nFixDays: number;
  groups: Record<BreachFixGroupId, BreachFixGroupStats>;
};

const BREACH_FIX_GROUP_LABELS: Record<BreachFixGroupId, string> = {
  A: 'breach=T fix=F',
  B: 'breach=T fix=T',
  C: 'breach=F fix=F',
  D: 'breach=F fix=T',
};

function initVariant(label: string): VariantSummary {
  return {
    label,
    analyzed: 0,
    judasFired: 0,
    breachCount: 0,
    insideCount: 0,
    correctCount: 0,
    correctExFix: 0,
    exFixAnalyzed: 0,
    textbook: 0,
    failed: 0,
    shifted: 0,
    vSweepDays: 0,
    vSweepCorrect: 0,
  };
}

function emptyBreachFixGroup(): BreachFixGroupStats {
  return {
    n: 0,
    correctHits: 0,
    peakJudasSum: 0,
    peakCounterSum: 0,
    peakSampleCount: 0,
  };
}

function initBreachFixWindow(windowLabel: string): BreachFixWindowStats {
  return {
    windowLabel,
    nFixDays: 0,
    groups: {
      A: emptyBreachFixGroup(),
      B: emptyBreachFixGroup(),
      C: emptyBreachFixGroup(),
      D: emptyBreachFixGroup(),
    },
  };
}

function pct(part: number, total: number): string {
  return total === 0 ? 'n/a' : `${Math.round((1000 * part) / total) / 10}%`;
}

function avg(sum: number, count: number): string {
  return count === 0 ? 'n/a' : `${Math.round((10 * sum) / count) / 10}`;
}

function variantKey(variant: JudasWindowVariant): string {
  return variant === 'current' ? 'current' : variant;
}

function isLondonFixDay(row: BacktestCsvRow): boolean {
  return (
    row.is_london_fix_day === true ||
    row.is_london_fix_day === 'true' ||
    row.is_potential_fix_day === true ||
    row.is_potential_fix_day === 'true'
  );
}

function readJudasCorrect(
  row: BacktestCsvRow,
  variant: JudasWindowVariant
): boolean | null {
  const suffix = variantKey(variant);
  const value = row[`judas_${suffix}_correct`];
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

function readPeakPips(
  row: BacktestCsvRow,
  variant: JudasWindowVariant
): { judas: number; counter: number } | null {
  const suffix = variantKey(variant);
  const judasRaw = row[`peak_favorable_${suffix}`];
  const counterRaw = row[`peak_counter_${suffix}`];
  if (judasRaw === '' || judasRaw == null) return null;
  const judas = Number(judasRaw);
  const counter = Number(counterRaw ?? 0);
  if (!Number.isFinite(judas)) return null;
  return { judas, counter: Number.isFinite(counter) ? counter : 0 };
}

function breachFixGroupId(breach: boolean, isFix: boolean): BreachFixGroupId {
  if (breach && !isFix) return 'A';
  if (breach && isFix) return 'B';
  if (!breach && !isFix) return 'C';
  return 'D';
}

function accumulateBreachFixGroup(
  stats: BreachFixGroupStats,
  correct: boolean | null,
  peaks: { judas: number; counter: number } | null
): void {
  stats.n += 1;
  if (correct === true) stats.correctHits += 1;
  if (peaks != null) {
    stats.peakJudasSum += peaks.judas;
    stats.peakCounterSum += peaks.counter;
    stats.peakSampleCount += 1;
  }
}

function accumulateVariant(
  bucket: VariantSummary,
  row: BacktestCsvRow,
  variant: JudasWindowVariant
): void {
  const suffix = variantKey(variant);
  const direction = String(row[`judas_${suffix}_direction`] ?? '');
  const fired = direction === 'UP' || direction === 'DOWN';
  const breach =
    row[`judas_${suffix}_breach`] === true ||
    row[`judas_${suffix}_breach`] === 'true';
  const correct =
    row[`judas_${suffix}_correct`] === true ||
    row[`judas_${suffix}_correct`] === 'true';
  const isFix = isLondonFixDay(row);
  const tagCol =
    variant === 'current' ? 'tag_window_current' : `tag_${variant}`;
  const tag = String(row[tagCol] ?? '');

  bucket.analyzed += 1;
  if (fired) {
    bucket.judasFired += 1;
    if (breach) bucket.breachCount += 1;
    else bucket.insideCount += 1;
    if (correct) bucket.correctCount += 1;
    if (!isFix) {
      bucket.exFixAnalyzed += 1;
      if (correct) bucket.correctExFix += 1;
    }
  }
  if (tag === 'AMD_TEXTBOOK') bucket.textbook += 1;
  if (tag === 'AMD_FAILED') bucket.failed += 1;
  if (tag === 'AMD_SHIFTED') bucket.shifted += 1;
  if (row.is_v_sweep === true) {
    bucket.vSweepDays += 1;
    if (correct) bucket.vSweepCorrect += 1;
  }
}

function accumulateBreachFixWindow(
  windowStats: BreachFixWindowStats,
  row: BacktestCsvRow,
  variant: JudasWindowVariant
): void {
  const suffix = variantKey(variant);
  const breach =
    row[`judas_${suffix}_breach`] === true ||
    row[`judas_${suffix}_breach`] === 'true';
  const isFix = isLondonFixDay(row);
  if (isFix) windowStats.nFixDays += 1;
  const groupId = breachFixGroupId(breach, isFix);
  accumulateBreachFixGroup(
    windowStats.groups[groupId],
    readJudasCorrect(row, variant),
    readPeakPips(row, variant)
  );
}

function printVariantBlock(bucket: VariantSummary): void {
  console.log(`\n--- ${bucket.label} ---`);
  console.log(`  Days analyzed: ${bucket.analyzed}`);
  console.log(
    `  Judas fired: ${bucket.judasFired}, breach rate: ${pct(bucket.breachCount, bucket.judasFired)}`
  );
  console.log(
    `  False Judas (inside Asian): ${pct(bucket.insideCount, bucket.judasFired)} ` +
      `(n=${bucket.insideCount})`
  );
  console.log(
    `  Direction accuracy (peak≥8p): ${pct(bucket.correctCount, bucket.judasFired)}`
  );
  console.log(
    `  Accuracy excl. Fix days: ${pct(bucket.correctExFix, bucket.exFixAnalyzed)} ` +
      `(n=${bucket.exFixAnalyzed})`
  );
  console.log(
    `  Tags — TEXTBOOK: ${bucket.textbook}, FAILED: ${bucket.failed}, SHIFTED: ${bucket.shifted}`
  );
  console.log(
    `  V-sweep days: ${bucket.vSweepDays}, accuracy: ${pct(bucket.vSweepCorrect, bucket.vSweepDays)}`
  );
}

function printBreachFixGroupRow(
  windowLabel: string,
  groupId: BreachFixGroupId,
  stats: BreachFixGroupStats
): void {
  const groupLabel = BREACH_FIX_GROUP_LABELS[groupId];
  console.log(
    `${windowLabel.padEnd(8)} | ${groupId} ${groupLabel.padEnd(18)} | ` +
      `n=${String(stats.n).padStart(3)} | ` +
      `judas_correct=${pct(stats.correctHits, stats.n).padStart(6)} | ` +
      `avg_judas_p=${avg(stats.peakJudasSum, stats.peakSampleCount).padStart(5)} | ` +
      `avg_counter_p=${avg(stats.peakCounterSum, stats.peakSampleCount).padStart(5)}`
  );
}

function printBreachFixExclusionTable(rows: BacktestCsvRow[]): void {
  const windows: {
    stats: BreachFixWindowStats;
    variant: JudasWindowVariant;
  }[] = [
    { stats: initBreachFixWindow('CURRENT'), variant: 'current' },
    { stats: initBreachFixWindow('NARROW'), variant: 'narrow' },
    { stats: initBreachFixWindow('TIGHT'), variant: 'tight' },
  ];

  for (const row of rows) {
    for (const window of windows) {
      accumulateBreachFixWindow(window.stats, row, window.variant);
    }
  }

  console.log('\n=== Window × Breach × Fix exclusion ===');
  console.log(
    'Window   | Group  Definition         | n   | judas_correct | avg_judas_p | avg_counter_p'
  );
  console.log(
    '---------|------|--------------------|-----|---------------|-------------|---------------'
  );

  for (const window of windows) {
    const { stats } = window;
    for (const groupId of ['A', 'B', 'C', 'D'] as BreachFixGroupId[]) {
      printBreachFixGroupRow(stats.windowLabel, groupId, stats.groups[groupId]);
    }
    console.log(
      `${stats.windowLabel.padEnd(8)} | meta | n_fix_days=${stats.nFixDays} ` +
        `n_breach_true_fix_false (Group A)=${stats.groups.A.n}`
    );
    console.log(
      '---------|------|--------------------|-----|---------------|-------------|---------------'
    );
  }
}

export function printJudasWindowSummary(rows: BacktestCsvRow[]): void {
  const current = initVariant('CURRENT 08:00-10:00');
  const narrow = initVariant('NARROW 07:00-09:00');
  const tight = initVariant('TIGHT 07:00-08:00');

  for (const row of rows) {
    accumulateVariant(current, row, 'current');
    accumulateVariant(narrow, row, 'narrow');
    accumulateVariant(tight, row, 'tight');
  }

  console.log('\n=== AMD Judas Window Backtest Summary ===');
  printVariantBlock(current);
  printVariantBlock(narrow);
  printVariantBlock(tight);
  printBreachFixExclusionTable(rows);

  const acc = [
    { name: 'CURRENT', rate: current.correctCount / Math.max(current.judasFired, 1) },
    { name: 'NARROW', rate: narrow.correctCount / Math.max(narrow.judasFired, 1) },
    { name: 'TIGHT', rate: tight.correctCount / Math.max(tight.judasFired, 1) },
  ].sort((a, b) => b.rate - a.rate);
  console.log(`\nBest window by Judas direction accuracy: ${acc[0]!.name}`);
}
