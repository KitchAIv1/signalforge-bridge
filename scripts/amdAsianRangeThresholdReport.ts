/**
 * Console report for amdAsianRangeThresholdBacktest.ts (split for file size limits).
 */

const THRESHOLDS = [25, 30, 35, 40, 45, 50] as const;

type OutputShape = {
  amd_tag: string;
  alignment_correct: string;
  distribution_direction: string;
  asian_range_pips: number;
  asian_is_flat: boolean | null;
  tag_at_25: string;
  tag_at_30: string;
  tag_at_35: string;
  tag_at_40: string;
  tag_at_45: string;
  tag_at_50: string;
};

type ProcessedForReport = OutputShape & {
  distribution_pips: number;
  judas_direction_raw: string | null;
  layer4_d1_bias_raw: string | null;
};

type PredictionInput = {
  amd_tag: string;
  judas_direction: string | null;
  layer4_d1_bias: string | null;
};

function computePredictedDirection(row: PredictionInput): string {
  const tag = row.amd_tag;
  const judas = row.judas_direction;
  const d1 = row.layer4_d1_bias;

  if (['AMD_TEXTBOOK', 'AMD_FAILED'].includes(tag)) {
    if (judas === 'UP') return 'DOWN';
    if (judas === 'DOWN') return 'UP';
    return 'NO_PREDICTION';
  }

  if (tag === 'AMD_COMPRESSION_BREAKOUT') {
    if (judas === 'UP') return 'UP';
    if (judas === 'DOWN') return 'DOWN';
    return 'NO_PREDICTION';
  }

  if (['AMD_SHIFTED', 'AMD_NONE'].includes(tag)) {
    if (d1 === 'TRENDING_UP') return 'UP';
    if (d1 === 'TRENDING_DOWN') return 'DOWN';
    return 'NO_PREDICTION';
  }

  return 'NO_PREDICTION';
}

function isCorrect(predicted: string, actual: string): string {
  if (
    predicted === 'NO_PREDICTION' ||
    actual === 'NO_DATA' ||
    actual === 'FLAT'
  ) {
    return 'n/a';
  }
  return predicted === actual ? 'true' : 'false';
}

function predictedForSyntheticTag(envelope: ProcessedForReport, tag: string): string {
  return computePredictedDirection({
    amd_tag: tag,
    judas_direction: envelope.judas_direction_raw,
    layer4_d1_bias: envelope.layer4_d1_bias_raw,
  });
}

function getTagAt(row: OutputShape, thr: number): string {
  if (thr === 25) return row.tag_at_25;
  if (thr === 30) return row.tag_at_30;
  if (thr === 35) return row.tag_at_35;
  if (thr === 40) return row.tag_at_40;
  if (thr === 45) return row.tag_at_45;
  return row.tag_at_50;
}

function pctFromAlignmentFlags(flags: string[]): string {
  const scored = flags.filter((f): f is 'true' | 'false' => f === 'true' || f === 'false');
  if (scored.length === 0) return 'n/a';
  const hits = scored.filter((f) => f === 'true').length;
  return `${Math.round((100 * hits) / scored.length)}%`;
}

function avgDistPips(pipsVals: number[]): string {
  if (pipsVals.length === 0) return '0.0';
  const sum = pipsVals.reduce((acc, pipValue) => acc + pipValue, 0);
  return (sum / pipsVals.length).toFixed(1);
}

function printProductionBaseline(rows: ProcessedForReport[]): void {
  console.log('--- Production threshold (35 pips) baseline ---');
  const tags = [
    'AMD_TEXTBOOK',
    'AMD_COMPRESSION_BREAKOUT',
    'AMD_SHIFTED',
    'AMD_FAILED',
    'AMD_NONE',
  ];
  for (const tagLabel of tags) {
    const sliceRows = rows.filter((r) => r.amd_tag === tagLabel);
    const pct = pctFromAlignmentFlags(sliceRows.map((r) => r.alignment_correct));
    const paddedTag = `${tagLabel}`.padEnd(24);
    console.log(`${paddedTag} | n=${sliceRows.length} | full_dist_correct: ${pct}`);
  }
}

const TAG_BUCKET_LABELS = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_SHIFTED',
  'AMD_FAILED',
  'AMD_NONE',
  'AMD_PARTIAL',
];

function abbreviationForAggregation(tagLabel: string): string {
  if (tagLabel === 'AMD_TEXTBOOK') return 'TEXTBOOK';
  if (tagLabel === 'AMD_COMPRESSION_BREAKOUT') return 'COMP_BRK';
  if (tagLabel === 'AMD_SHIFTED') return 'SHIFTED';
  if (tagLabel === 'AMD_FAILED') return 'FAILED';
  if (tagLabel === 'AMD_NONE') return 'NONE';
  return 'PARTIAL';
}

function printTagDistribution(rows: ProcessedForReport[]): void {
  console.log('');
  console.log('--- Tag distribution changes per threshold ---');
  const headerSuffix = TAG_BUCKET_LABELS.map(abbreviationForAggregation).join(' | ');
  console.log(`Threshold | ${headerSuffix}`);
  for (const thr of THRESHOLDS) {
    const counts: Record<string, number> = {};
    for (const k of TAG_BUCKET_LABELS) counts[k] = 0;
    for (const envelopeRow of rows) {
      const resolvedTag = getTagAt(envelopeRow, thr);
      counts[resolvedTag] = (counts[resolvedTag] ?? 0) + 1;
    }
    const parts = TAG_BUCKET_LABELS.map((label) => `n=${counts[label] ?? 0}`);
    const prodNote = thr === 35 ? ' ← production' : '';
    console.log(`${thr} pips${prodNote} | ${parts.join(' | ')}`);
  }
}

function printSyntheticTextbook(rows: ProcessedForReport[]): void {
  console.log('');
  console.log('--- Accuracy of TEXTBOOK tag at each threshold ---');
  console.log(
    '(Using Judas inversion prediction on rows tagged TEXTBOOK at that threshold)',
  );
  console.log('Threshold | n_textbook | alignment_correct% | avg_dist_pips');
  for (const thr of THRESHOLDS) {
    const cohort = rows.filter((r) => getTagAt(r, thr) === 'AMD_TEXTBOOK');
    const cohortFlags = cohort.map((envRow) => {
      const pred = predictedForSyntheticTag(envRow, 'AMD_TEXTBOOK');
      return isCorrect(pred, envRow.distribution_direction);
    });
    const scoredPct = pctFromAlignmentFlags(cohortFlags);
    const prodNote = thr === 35 ? ' ← production' : '';
    console.log(
      `${thr} pips${prodNote} | ${cohort.length} | ${scoredPct} | ` +
        `${avgDistPips(cohort.map((envRow) => envRow.distribution_pips))}`,
    );
  }
}

function printSyntheticShifted(rows: ProcessedForReport[]): void {
  console.log('');
  console.log('--- Accuracy of SHIFTED tag at each threshold ---');
  console.log(
    '(Using D1 bias prediction on rows tagged SHIFTED at that threshold)',
  );
  console.log('Threshold | n_shifted | alignment_correct% | avg_dist_pips');
  for (const thr of THRESHOLDS) {
    const cohort = rows.filter((r) => getTagAt(r, thr) === 'AMD_SHIFTED');
    const cohortFlags = cohort.map((envRow) => {
      const pred = predictedForSyntheticTag(envRow, 'AMD_SHIFTED');
      return isCorrect(pred, envRow.distribution_direction);
    });
    const scoredPct = pctFromAlignmentFlags(cohortFlags);
    const prodNote = thr === 35 ? ' ← production' : '';
    console.log(
      `${thr} pips${prodNote} | ${cohort.length} | ${scoredPct} | ` +
        `${avgDistPips(cohort.map((envRow) => envRow.distribution_pips))}`,
    );
  }
}

function pctInversionSubset(subsetRows: ProcessedForReport[]): string {
  const cohortFlags = subsetRows.map((envRow) => {
    const pred = predictedForSyntheticTag(envRow, 'AMD_TEXTBOOK');
    return isCorrect(pred, envRow.distribution_direction);
  });
  return pctFromAlignmentFlags(cohortFlags);
}

function printShiftTransition(rows: ProcessedForReport[]): void {
  console.log('');
  console.log(
    '--- Key question: rows that would move from SHIFTED to TEXTBOOK at higher thresholds ---',
  );

  const t35to40 = rows.filter(
    (r) =>
      getTagAt(r, 35) === 'AMD_SHIFTED' && getTagAt(r, 40) === 'AMD_TEXTBOOK',
  );
  console.log(`Rows currently SHIFTED at 35 pips that become TEXTBOOK at 40 pips:
  n=${t35to40.length} | Judas inversion accuracy on these rows: ${pctInversionSubset(t35to40)}
  (If >68%: raising threshold improves TEXTBOOK quality)
  (If <68%: raising threshold dilutes TEXTBOOK quality)`);

  const t35to45 = rows.filter(
    (r) =>
      getTagAt(r, 35) === 'AMD_SHIFTED' && getTagAt(r, 45) === 'AMD_TEXTBOOK',
  );
  console.log(`
Rows currently SHIFTED at 35 pips that become TEXTBOOK at 45 pips:
  n=${t35to45.length} | Judas inversion accuracy on these rows: ${pctInversionSubset(t35to45)}
`);
}

function printFlatBoundary(rows: ProcessedForReport[], thr: number): void {
  const below = rows.filter((r) => r.asian_range_pips < thr);
  let flatTrue = 0;
  let flatFalse = 0;
  let flatNull = 0;
  for (const envelopeRow of below) {
    if (envelopeRow.asian_is_flat === true) flatTrue++;
    else if (envelopeRow.asian_is_flat === false) flatFalse++;
    else flatNull++;
  }
  console.log(`
Threshold ${thr}: rows where asian_range < ${thr}
  asian_is_flat=true  | n=${flatTrue} (these are TEXTBOOK-eligible)
  asian_is_flat=false | n=${flatFalse} (these become SHIFTED regardless)
  asian_is_flat=null | n=${flatNull}`);
}

function printFlatBreakdown(rows: ProcessedForReport[]): void {
  console.log('--- asian_is_flat breakdown within each threshold boundary ---');
  printFlatBoundary(rows, 35);
  printFlatBoundary(rows, 40);
}

export function printAsianRangeThresholdReport(
  rowsLoadedTotal: number,
  skippedNoChart: number,
  rows: ProcessedForReport[],
): void {
  console.log('');
  console.log('=== ASIAN RANGE THRESHOLD ANALYSIS ===');
  console.log(`Total rows processed: ${rowsLoadedTotal}`);
  console.log(`Rows skipped (no chart_data): ${skippedNoChart}`);
  console.log('');
  printProductionBaseline(rows);
  printTagDistribution(rows);
  printSyntheticTextbook(rows);
  printSyntheticShifted(rows);
  printShiftTransition(rows);
  printFlatBreakdown(rows);
}
