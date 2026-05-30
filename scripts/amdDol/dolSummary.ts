import type { DailyCloseDirection, DolBacktestRow, ProductionDirection } from './types.js';
import {
  accuracyHits,
  avg,
  dolAccuracyHits,
  isScorableForAccuracy,
  parsePct,
  pct,
  ppDelta,
} from './dolSummaryHelpers.js';

type Predicate = (row: DolBacktestRow) => boolean;

export function printDolSummary(rows: DolBacktestRow[]): void {
  printBucket1Headline(rows);
  printBucket2ByTag(rows);
  printBucket3ByAlignment(rows);
  printBucket4Conflicted(rows);
  printBucket5SignalIsolation(rows);
  printBucket6DolTiming(rows);
  printBucket7ExitGap(rows);
  printBucket8TagOutcome(rows);
  printBucket9MayDump(rows);
  printBucket10Comparison(rows);
}

function printBucket1Headline(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 1 — Headline ===');
  const scorable = rows.filter(isScorableForAccuracy);
  const prod = accuracyHits(rows, 'daily_close_matches_production');
  const auto = accuracyHits(rows, 'daily_close_matches_auto');
  const inv = accuracyHits(rows, 'daily_close_matches_inversion');
  const dol = dolAccuracyHits(rows);
  const neutralExcluded = rows.filter((row) => row.predicted_production === 'neutral').length;
  const passedExcluded = rows.filter((row) => row.dol_already_passed === true).length;
  console.log(
    `n=${scorable.length} production=${pct(prod.hits, prod.total)} auto=${pct(auto.hits, auto.total)} ` +
      `inversion=${pct(inv.hits, inv.total)} dol=${pct(dol.hits, dol.total)}`
  );
  console.log(
    `excluded_neutral=${neutralExcluded} excluded_dol_already_passed=${passedExcluded}`
  );
  const prodPct = parsePct(pct(prod.hits, prod.total));
  const invPct = parsePct(pct(inv.hits, inv.total));
  const autoPct = parsePct(pct(auto.hits, auto.total));
  if (prodPct != null && invPct != null) {
    console.log(`Production vs Inversion edge: ${ppDelta(prodPct, invPct)}`);
  }
  if (prodPct != null && autoPct != null) {
    console.log(`Auto vs Production gap: ${ppDelta(autoPct, prodPct)}`);
  }
}

function printBucket2ByTag(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 2 — By amd_tag ===');
  const tags = [...new Set(rows.map((row) => String(row.amd_tag ?? 'null')))].sort();
  for (const tag of tags) printTagLine(rows.filter((row) => String(row.amd_tag) === tag), tag);
}

function printTagLine(subset: DolBacktestRow[], label: string): void {
  const prod = accuracyHits(subset, 'daily_close_matches_production');
  const auto = accuracyHits(subset, 'daily_close_matches_auto');
  const dol = dolAccuracyHits(subset);
  const passedPct = pct(
    subset.filter((row) => row.dol_already_passed === true).length,
    subset.length
  );
  console.log(
    `${label}: n=${subset.length} production=${pct(prod.hits, prod.total)} auto=${pct(auto.hits, auto.total)} ` +
      `dol=${pct(dol.hits, dol.total)} avg_peak=${avg(subset.map((row) => row.peak_favorable_pips))} ` +
      `avg_dol_dist=${avg(subset.map((row) => row.dol_target_distance_pips))} dol_already_passed=${passedPct}`
  );
}

function printBucket3ByAlignment(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 3 — By daily_bias_alignment ===');
  for (const alignment of ['ALIGNED', 'CONFLICTED', 'RANGING']) {
    printAccuracyLine(`${alignment}`, rows.filter((row) => row.daily_bias_alignment === alignment));
  }
}

function printBucket4Conflicted(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 4 — CONFLICTED deep dive ===');
  const conflicted = rows.filter(
    (row) => row.daily_bias_alignment === 'CONFLICTED' && isScorableForAccuracy(row)
  );
  const splits: Array<[string, Predicate]> = [
    ['weekly_open=ABOVE', (row) => row.weekly_open_bias_computed === 'ABOVE'],
    ['weekly_open=BELOW', (row) => row.weekly_open_bias_computed === 'BELOW'],
    ['monthly_open=ABOVE', (row) => row.monthly_open_bias_computed === 'ABOVE'],
    ['monthly_open=BELOW', (row) => row.monthly_open_bias_computed === 'BELOW'],
    ['prior_d1=BULLISH', (row) => row.prior_d1_direction === 'BULLISH'],
    ['prior_d1=BEARISH', (row) => row.prior_d1_direction === 'BEARISH'],
    ['asian_swept_pdl=true', (row) => row.asian_swept_prev_low === true],
    ['asian_swept_pdl=false', (row) => row.asian_swept_prev_low === false],
    ['judas_swept_pdl=true', (row) => row.judas_swept_prev_low === true],
    ['judas_swept_pdl=false', (row) => row.judas_swept_prev_low === false],
  ];
  for (const [label, predicate] of splits) {
    printAccuracyLine(`CONFLICTED + ${label}`, conflicted.filter(predicate));
  }
  printAccuracyLine(
    'CONFLICTED full LONG alignment',
    conflicted.filter(
      (row) =>
        row.weekly_open_bias_computed === 'ABOVE' &&
        row.monthly_open_bias_computed === 'ABOVE' &&
        row.asian_swept_prev_low === true
    )
  );
  printAccuracyLine(
    'CONFLICTED full SHORT alignment',
    conflicted.filter(
      (row) =>
        row.weekly_open_bias_computed === 'BELOW' &&
        row.monthly_open_bias_computed === 'BELOW' &&
        row.judas_swept_prev_low === true
    )
  );
}

export function printBucket5SignalIsolation(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 5 — Signal isolation ===');
  console.log(
    'NOTE: prior_d1_direction removed — circular (stores trade_date own daily candle direction, ' +
      'not prior day. Real prior D1 accuracy = 45.4% when correctly lagged — no edge over baseline.)'
  );
  const baseline = accuracyHits(rows, 'daily_close_matches_inversion');
  const baselinePct = parsePct(pct(baseline.hits, baseline.total)) ?? 0;
  const signals: Array<[string, (row: DolBacktestRow) => ProductionDirection | null]> = [
    ['weekly_open_bias', (row) => biasDirection(row.weekly_open_bias_computed)],
    ['monthly_open_bias', (row) => biasDirection(row.monthly_open_bias_computed)],
    ['asian_close_bias', (row) => asianCloseDirection(row.asian_close_bias)],
    ['asian_swept_prev_low', (row) => (row.asian_swept_prev_low ? 'long' : null)],
    ['judas_swept_prev_low', (row) => (row.judas_swept_prev_low ? 'long' : null)],
    ['judas_inversion', () => null],
    ['production_logic', () => null],
    ['auto_direction', () => null],
  ];
  for (const [label, pick] of signals) {
    if (label === 'judas_inversion') {
      console.log(`  ${label}: n=${baseline.total} accuracy=${pct(baseline.hits, baseline.total)} (baseline)`);
      continue;
    }
    if (label === 'production_logic') {
      const prod = accuracyHits(rows, 'daily_close_matches_production');
      console.log(`  ${label}: n=${prod.total} accuracy=${pct(prod.hits, prod.total)}`);
      continue;
    }
    if (label === 'auto_direction') {
      const auto = accuracyHits(rows, 'daily_close_matches_auto');
      console.log(`  ${label}: n=${auto.total} accuracy=${pct(auto.hits, auto.total)}`);
      continue;
    }
    printSignalLine(label, rows, pick, baselinePct);
  }
}

function printSignalLine(
  label: string,
  rows: DolBacktestRow[],
  pick: (row: DolBacktestRow) => ProductionDirection | null,
  baselinePct: number
): void {
  let hits = 0;
  let total = 0;
  for (const row of rows) {
    const prediction = pick(row);
    if (!prediction || row.daily_close_direction === 'DOJI' || row.daily_close_direction == null) continue;
    total += 1;
    if (productionToDaily(prediction) === row.daily_close_direction) hits += 1;
  }
  const signalPct = parsePct(pct(hits, total)) ?? 0;
  console.log(
    `  ${label}: n=${total} accuracy=${pct(hits, total)} edge_vs_baseline=${ppDelta(signalPct, baselinePct)}`
  );
}

function printBucket6DolTiming(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 6 — DOL timing ===');
  const buckets = [[0, 12], [12, 24], [24, 36], [36, 48], [48, 60], [60, 72]] as const;
  for (const [start, end] of buckets) {
    const count = rows.filter((row) => inBucket(row.bar_index_dol_reached, start, end)).length;
    console.log(`  bars ${start}-${end - 1}: ${count}`);
  }
  const never = rows.filter((row) => row.dol_reached === false).length;
  console.log(`  never reached: ${never}`);
  const reached = rows.filter((row) => row.dol_reached === true);
  const nyHits = reached.filter((row) => row.dol_reached_in_ny_am === true).length;
  console.log(`NY AM kill zone responsible for ${pct(nyHits, reached.length)} of DOL-reached days`);
}

function printBucket7ExitGap(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 7 — Exit gap ===');
  const reached = rows.filter((row) => row.dol_reached === true);
  const beyond = reached
    .map((row) => (row.peak_favorable_pips ?? 0) - (row.dol_target_distance_pips ?? 0))
    .filter((value) => Number.isFinite(value));
  console.log(`dol_reached=true n=${reached.length} avg_beyond_dol=${avg(beyond)}`);
  for (const threshold of [10, 20, 30]) {
    const count = beyond.filter((value) => value >= threshold).length;
    console.log(`  continued ${threshold}+ pips past DOL: ${count} (${pct(count, reached.length)})`);
  }
  const missed = rows.filter((row) => row.dol_reached === false && (row.peak_favorable_pips ?? 0) > 0);
  console.log(
    `missed DOL but moved favorably n=${missed.length} avg_peak=${avg(missed.map((row) => row.peak_favorable_pips))} ` +
      `avg_target=${avg(missed.map((row) => row.dol_target_distance_pips))}`
  );
}

function printBucket8TagOutcome(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 8 — Tag outcome accuracy ===');
  const populated = rows.filter((row) => row.amd_outcome_tag != null);
  const stable = populated.filter((row) => row.amd_tag === row.amd_outcome_tag).length;
  console.log(`Tag stability: ${pct(stable, populated.length)} kept same tag through distribution`);
  const outcome = accuracyHits(populated, 'outcome_matches_production');
  console.log(`predicted_production vs outcome_direction_from_tag: n=${outcome.total} accuracy=${pct(outcome.hits, outcome.total)}`);
}

function printBucket9MayDump(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 9 — May 28 and May 29 full dump ===');
  for (const tradeDate of ['2026-05-28', '2026-05-29']) {
    const row = rows.find((entry) => entry.trade_date === tradeDate);
    console.log(`\n${tradeDate}: ${row ? JSON.stringify(row, null, 2) : 'NOT IN COHORT'}`);
  }
}

function printBucket10Comparison(rows: DolBacktestRow[]): void {
  console.log('\n=== Bucket 10 — Production vs prior backtests ===');
  const scorable = rows.filter(isScorableForAccuracy);
  const prod = accuracyHits(rows, 'daily_close_matches_production');
  const inv = accuracyHits(rows, 'daily_close_matches_inversion');
  const conflicted = rows.filter((row) => row.daily_bias_alignment === 'CONFLICTED' && isScorableForAccuracy(row));
  const conflictedProd = accuracyHits(conflicted, 'daily_close_matches_production');
  const conflictedInv = accuracyHits(conflicted, 'daily_close_matches_inversion');
  console.log(`Metric | Inversion baseline | Production (DOL)`);
  console.log(`Overall | ${pct(inv.hits, inv.total)} | ${pct(prod.hits, prod.total)}`);
  console.log(`CONFLICTED | ${pct(conflictedInv.hits, conflictedInv.total)} | ${pct(conflictedProd.hits, conflictedProd.total)}`);
  for (const tag of ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED', 'AMD_SHIFTED', 'AMD_NONE']) {
    const subset = scorable.filter((row) => row.amd_tag === tag);
    const tagProd = accuracyHits(subset, 'daily_close_matches_production');
    const tagInv = accuracyHits(subset, 'daily_close_matches_inversion');
    console.log(`${tag} | ${pct(tagInv.hits, tagInv.total)} | ${pct(tagProd.hits, tagProd.total)}`);
  }
  const prodPct = parsePct(pct(prod.hits, prod.total)) ?? 0;
  const invPct = parsePct(pct(inv.hits, inv.total)) ?? 0;
  const cProdPct = parsePct(pct(conflictedProd.hits, conflictedProd.total)) ?? 0;
  const cInvPct = parsePct(pct(conflictedInv.hits, conflictedInv.total)) ?? 0;
  console.log(`Net improvement: ${ppDelta(prodPct, invPct)} across all days`);
  console.log(`Net improvement on CONFLICTED: ${ppDelta(cProdPct, cInvPct)}`);
}

function printAccuracyLine(label: string, subset: DolBacktestRow[]): void {
  const prod = accuracyHits(subset, 'daily_close_matches_production');
  const auto = accuracyHits(subset, 'daily_close_matches_auto');
  const dol = dolAccuracyHits(subset);
  console.log(
    `${label}: n=${subset.length} production=${pct(prod.hits, prod.total)} auto=${pct(auto.hits, auto.total)} dol=${pct(dol.hits, dol.total)}`
  );
}

function biasDirection(bias: string | null): ProductionDirection | null {
  if (bias === 'ABOVE') return 'long';
  if (bias === 'BELOW') return 'short';
  return null;
}

function asianCloseDirection(bias: string | null): ProductionDirection | null {
  if (bias === 'BULLISH') return 'long';
  if (bias === 'BEARISH') return 'short';
  return null;
}

function productionToDaily(predicted: ProductionDirection): DailyCloseDirection | null {
  if (predicted === 'long') return 'LONG';
  if (predicted === 'short') return 'SHORT';
  return null;
}

function inBucket(index: number | null, start: number, end: number): boolean {
  if (index == null) return false;
  return index >= start && index < end;
}
